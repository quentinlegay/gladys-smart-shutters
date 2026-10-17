// -----------------------------------------------------------------------------
// The refresh loop: every `refresh_interval` minutes,
//   1. the location of the house (Gladys `getHouses`, manifest `location`);
//   2. the weather (Open-Meteo), or a fallback when it cannot be reached:
//      the last forecast while it is less than 3 hours old, then a clear-sky
//      model computed locally — the badge of the devices turns degraded;
//   3. the sun position (computed locally, src/solar.js);
//   4. per façade, the decision of the engine, the anti-flapping, the pause;
//   5. the states of the devices, the scene triggers of the transitions, the
//      transport badges, a nudge to the widgets, and the state in /data.
//
// Refreshes never overlap: a refresh asked during another one waits for it.
// -----------------------------------------------------------------------------

import { createLogger, DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { decide, stabilize, windActive } from './engine.js';
import { FACADE_FEATURE, SUN_FEATURE, facadeGeometry, facadeIds, sunIds } from './facades.js';
import { NO_FACADE, NO_LOCATION, reasonLabel } from './i18n.js';
import { clearSkyRadiation, nextSunEvents, sunPosition } from './solar.js';
import {
  TRIGGERS,
  heatDayData,
  positionChangedData,
  sunOnFacadeData,
  windProtectionData,
} from './triggers.js';

const logger = createLogger({ name: 'controller' });

// A forecast older than this is no longer trusted: the clear-sky model takes
// over.
export const STALE_WEATHER_MS = 3 * 3600000;
// Re-send an unchanged state every 30 minutes, so it stays recently dated.
const HEARTBEAT_MS = 30 * 60000;

export const WEATHER_SOURCES = { LIVE: 'live', STALE: 'stale', CLEAR_SKY: 'clear_sky' };

const DEGRADED_MESSAGES = {
  [WEATHER_SOURCES.STALE]: {
    en: 'Weather service unreachable: decisions use the last forecast',
    fr: 'Service météo injoignable : décisions sur la dernière prévision',
    de: 'Wetterdienst nicht erreichbar: Entscheidungen nach der letzten Vorhersage',
    es: 'Servicio meteorológico inaccesible: decisiones con la última previsión',
  },
  [WEATHER_SOURCES.CLEAR_SKY]: {
    en: 'Weather service unreachable: decisions assume a clear sky',
    fr: 'Service météo injoignable : décisions par ciel dégagé supposé',
    de: 'Wetterdienst nicht erreichbar: Entscheidungen bei angenommenem klarem Himmel',
    es: 'Servicio meteorológico inaccesible: decisiones suponiendo cielo despejado',
  },
};

/** Local date (YYYY-MM-DD) of an instant at a UTC offset. */
const localDate = (ms, offsetSeconds) =>
  new Date(ms + offsetSeconds * 1000).toISOString().slice(0, 10);

export class ShutterController {
  /**
   * @param {object} options
   * @param {import('@gladysassistant/integration-sdk').GladysIntegration} options.gladys
   * @param {ReturnType<import('./store.js').createStore>} options.store
   * @param {ReturnType<import('./weather.js').createWeatherClient>} options.weatherClient
   * @param {() => object} options.getConfig
   * @param {() => number} [options.now]
   * @param {(gladys: object) => void} [options.onRefreshed] - widget nudge
   */
  constructor({ gladys, store, weatherClient, getConfig, now = Date.now, onRefreshed = () => {} }) {
    this.gladys = gladys;
    this.store = store;
    this.weatherClient = weatherClient;
    this.getConfig = getConfig;
    this.now = now;
    this.onRefreshed = onRefreshed;
    this.timer = null;
    this.running = Promise.resolve();
    this.reset();
  }

  /** Forget everything computed (the persisted state stays in the store). */
  reset() {
    this.location = null;
    // Last forecast received from Open-Meteo.
    this.forecast = null;
    this.weatherSource = null;
    this.weatherError = null;
    this.weather = null;
    this.sun = null;
    this.decisions = {};
    this.lastRefresh = null;
  }

  get facades() {
    return this.store.state.facades;
  }

  runtimeOf(facade) {
    return this.store.state.runtime[facade.id] ?? {};
  }

  /** Automation of a façade, with an expired pause already lifted. */
  isAutomatic(facade, now = this.now()) {
    const runtime = this.runtimeOf(facade);
    if (runtime.automation === false) {
      return runtime.paused_until != null && runtime.paused_until <= now;
    }
    return true;
  }

  start() {
    this.stop();
    const schedule = () => {
      this.timer = setTimeout(async () => {
        await this.refresh({ reason: 'timer' }).catch(() => {});
        if (this.timer) {
          schedule();
        }
      }, this.getConfig().refresh_interval * 60000);
      this.timer.unref?.();
    };
    schedule();
  }

  stop() {
    clearTimeout(this.timer);
    this.timer = null;
  }

  /** Run one refresh, after the one in progress if any. */
  refresh({ reason = 'manual' } = {}) {
    const run = this.running.then(() => this.runRefresh(reason));
    this.running = run.catch(() => {});
    return run;
  }

  async resolveLocation() {
    const { house } = this.getConfig();
    const houses = await this.gladys.getHouses();
    const located = houses.filter(
      (h) => typeof h.latitude === 'number' && typeof h.longitude === 'number',
    );
    const chosen = (house && located.find((h) => h.selector === house)) || located[0] || null;
    if (house && chosen && chosen.selector !== house) {
      logger.warn(`House "${house}" has no coordinates, using "${chosen.selector}"`);
    }
    this.location = chosen
      ? {
          latitude: chosen.latitude,
          longitude: chosen.longitude,
          name: chosen.name,
          selector: chosen.selector,
        }
      : null;
    return this.location;
  }

  /** The weather the engine uses now, and where it comes from. */
  async readWeather(now) {
    try {
      this.forecast = await this.weatherClient.forecast(this.location);
      this.weatherError = null;
      this.weatherSource = WEATHER_SOURCES.LIVE;
    } catch (err) {
      this.weatherError = err;
      logger.warn(`Weather refresh failed: ${err.message}`);
      const fresh = this.forecast && now - this.forecast.fetched_at < STALE_WEATHER_MS;
      this.weatherSource = fresh ? WEATHER_SOURCES.STALE : WEATHER_SOURCES.CLEAR_SKY;
    }
    if (this.weatherSource === WEATHER_SOURCES.CLEAR_SKY) {
      const radiation = clearSkyRadiation(this.sun.elevation);
      return {
        temperature: null,
        temperature_max: null,
        cloud_cover: null,
        wind_speed: null,
        wind_gusts: null,
        uv_index: null,
        ...radiation,
      };
    }
    // The hourly slot of now, when the forecast is stale; the current block
    // otherwise.
    const point =
      this.weatherSource === WEATHER_SOURCES.LIVE
        ? this.forecast.current
        : (this.forecast.hourly.findLast((p) => p.time <= now) ?? this.forecast.current);
    return { ...point, temperature_max: this.forecast.today.temperature_max };
  }

  async runRefresh(reason) {
    const config = this.getConfig();
    const now = this.now();
    logger.debug(`Refresh (${reason})`);

    if (!(await this.resolveLocation())) {
      await this.gladys.setConnectionStatus(false, NO_LOCATION);
      this.onRefreshed(this.gladys);
      return { ok: false };
    }
    const { latitude, longitude } = this.location;
    this.sun = sunPosition(now, latitude, longitude);
    this.weather = await this.readWeather(now);
    this.lastRefresh = now;

    const state = this.store.state;
    const events = [];

    // --- Wind --------------------------------------------------------------
    // Without gusts (offline, clear-sky model) the protection stays as it was:
    // lifting it blindly could leave the shutters out in a storm.
    const wind =
      this.weather.wind_gusts == null
        ? state.wind_active
        : windActive(this.weather, config, state.wind_active);
    if (wind !== state.wind_active) {
      logger.info(
        `Wind protection ${wind ? 'started' : 'ended'} (gusts ${this.weather.wind_gusts} km/h)`,
      );
      events.push([
        TRIGGERS.WIND_PROTECTION,
        windProtectionData({ active: wind, weather: this.weather, config }),
      ]);
    }

    // --- Heat day (once per local day, from a real forecast only) ----------
    let heatDay = state.heat_day_announced;
    if (this.weatherSource === WEATHER_SOURCES.LIVE && this.weather.temperature_max != null) {
      const today = localDate(now, this.forecast.utc_offset_seconds);
      if (
        this.weather.temperature_max >= config.heat_threshold &&
        heatDay !== today &&
        this.sun.elevation > 0
      ) {
        heatDay = today;
        events.push([TRIGGERS.HEAT_DAY, heatDayData({ weather: this.weather })]);
      }
    }

    // --- Façades -----------------------------------------------------------
    const runtime = {};
    const states = this.sunStates();
    for (const facade of this.facades) {
      const previous = this.runtimeOf(facade);
      const ids = facadeIds(this.gladys, facade);
      const decision = decide({
        facade: facadeGeometry(facade),
        sun: this.sun,
        weather: this.weather,
        config,
        wind,
        wasShading: previous.shading === true,
      });
      this.decisions[facade.id] = decision;

      if (
        previous.sun_on_facade !== undefined &&
        previous.sun_on_facade !== decision.sun_on_facade
      ) {
        events.push([
          TRIGGERS.SUN_ON_FACADE,
          sunOnFacadeData({
            facadeExternalId: ids.device,
            facade,
            arrived: decision.sun_on_facade,
            sun: this.sun,
          }),
        ]);
      }

      const automatic = this.isAutomatic(facade, now);
      const next = {
        ...previous,
        automation: automatic,
        paused_until: automatic ? null : (previous.paused_until ?? null),
        reason: decision.reason,
        shading: decision.shading,
        sun_on_facade: decision.sun_on_facade,
        irradiance: decision.irradiance,
      };
      if (automatic) {
        const applied = {
          position: previous.position,
          reason: previous.applied_reason,
          changed_at: previous.changed_at,
        };
        const stable = stabilize(decision, applied, config, now);
        if (stable.changed) {
          logger.info(
            `${facade.name}: ${previous.position ?? '-'} -> ${stable.position} % (${decision.reason})`,
          );
          events.push([
            TRIGGERS.POSITION_CHANGED,
            positionChangedData({
              facadeExternalId: ids.device,
              facade,
              position: stable.position,
              previousPosition: previous.position,
              decision,
              sun: this.sun,
            }),
          ]);
          next.position = stable.position;
          next.changed_at = now;
          next.applied_reason = decision.reason;
        }
        next.recommended = next.position;
      } else {
        // Paused: show what the automation would do, send nothing.
        next.recommended = decision.position;
      }
      runtime[facade.id] = next;
      states.push(...this.facadeStates(facade, next));
    }

    await this.store.update({ runtime, wind_active: wind, heat_day_announced: heatDay });

    // --- Publish -----------------------------------------------------------
    await this.publish(states);
    for (const [key, data] of events) {
      await this.gladys
        .publishSceneEvent(key, data)
        .catch((err) => logger.warn(`Scene event ${key} refused: ${err.message}`));
    }
    await this.gladys.setConnectionStatus(true);
    this.onRefreshed(this.gladys);
    return { ok: true, events: events.length };
  }

  sunStates() {
    const ids = sunIds(this.gladys);
    const value = (key, state) =>
      state == null
        ? null
        : { device_feature_external_id: ids.feature(key), state: Math.round(state * 10) / 10 };
    return [
      value(SUN_FEATURE.ELEVATION, this.sun.elevation),
      value(SUN_FEATURE.AZIMUTH, this.sun.azimuth),
      value(SUN_FEATURE.IRRADIANCE, this.weather.ghi),
      value(SUN_FEATURE.CLOUD_COVER, this.weather.cloud_cover),
      value(SUN_FEATURE.TEMPERATURE, this.weather.temperature),
      value(SUN_FEATURE.WIND_GUSTS, this.weather.wind_gusts),
      value(
        SUN_FEATURE.UV_INDEX,
        this.weather.uv_index == null ? null : Math.round(this.weather.uv_index),
      ),
    ].filter(Boolean);
  }

  facadeStates(facade, runtime) {
    const ids = facadeIds(this.gladys, facade);
    const value = (key, state) => ({ device_feature_external_id: ids.feature(key), state });
    const states = [
      value(FACADE_FEATURE.AUTOMATION, runtime.automation ? 1 : 0),
      value(FACADE_FEATURE.SUN_ON_FACADE, runtime.sun_on_facade ? 1 : 0),
      value(FACADE_FEATURE.IRRADIANCE, runtime.irradiance ?? 0),
      {
        device_feature_external_id: ids.feature(FACADE_FEATURE.REASON),
        text: reasonLabel(runtime.reason, 'en'),
      },
    ];
    if (runtime.recommended != null) {
      states.unshift(value(FACADE_FEATURE.POSITION, runtime.recommended));
    }
    return states;
  }

  async publish(states) {
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
    } catch (err) {
      logger.warn(`States not published: ${err.message}`);
    }
    await this.publishTransports();
  }

  /** The cloud badge of every device, degraded while the weather is not live. */
  async publishTransports() {
    if (!this.weatherSource) {
      return;
    }
    const degraded = DEGRADED_MESSAGES[this.weatherSource];
    const entry = (externalId) => ({
      external_id: externalId,
      transport: DEVICE_TRANSPORTS.CLOUD,
      ...(degraded ? { degraded: true, message: degraded } : {}),
    });
    const entries = [
      entry(sunIds(this.gladys).device),
      ...this.facades.map((facade) => entry(facadeIds(this.gladys, facade).device)),
    ];
    await this.gladys
      .publishTransports(entries)
      .catch((err) => logger.warn(`Transports not published: ${err.message}`));
  }

  /** Re-publish every state (a device was just created in Gladys). */
  async republish() {
    if (!this.sun) {
      return;
    }
    const states = this.sunStates();
    for (const facade of this.facades) {
      states.push(...this.facadeStates(facade, this.runtimeOf(facade)));
    }
    await this.publish(states);
  }

  /**
   * Pause the automation of façades: `minutes` 0 = until resumed. Sends no
   * event (a scene action must never fire a trigger: a scene bound to it would
   * loop).
   * @returns {number|null} the end of the pause (epoch ms), null if open-ended
   */
  async pause(facades, minutes) {
    const now = this.now();
    const until = minutes > 0 ? now + minutes * 60000 : null;
    const runtime = { ...this.store.state.runtime };
    for (const facade of facades) {
      runtime[facade.id] = { ...runtime[facade.id], automation: false, paused_until: until };
    }
    await this.store.update({ runtime });
    await this.publishAutomation(facades);
    return until;
  }

  /**
   * Resume the automation. The shutters are not moved at once (no event, see
   * pause): the next change of the recommendation is announced as usual.
   */
  async resume(facades) {
    const runtime = { ...this.store.state.runtime };
    for (const facade of facades) {
      runtime[facade.id] = { ...runtime[facade.id], automation: true, paused_until: null };
    }
    await this.store.update({ runtime });
    await this.publishAutomation(facades);
  }

  async publishAutomation(facades) {
    const states = facades.map((facade) => ({
      device_feature_external_id: facadeIds(this.gladys, facade).feature(FACADE_FEATURE.AUTOMATION),
      state: this.runtimeOf(facade).automation === false ? 0 : 1,
    }));
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
    } catch (err) {
      logger.warn(`Automation states not published: ${err.message}`);
    }
    this.onRefreshed(this.gladys);
  }

  /** Sunrise and sunset to come, computed locally. */
  sunEvents(now = this.now()) {
    if (!this.location) {
      return { sunrise: null, sunset: null };
    }
    return nextSunEvents(now, this.location.latitude, this.location.longitude);
  }

  /** Why nothing can be shown, or null. */
  blocker() {
    if (!this.location) {
      return NO_LOCATION;
    }
    if (this.facades.length === 0) {
      return NO_FACADE;
    }
    return null;
  }
}
