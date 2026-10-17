// -----------------------------------------------------------------------------
// Dashboard widgets (SDK v0.14+, Gladys 5.1+).
//
// The manifest `widgets` field declares their identity (key, label, icon,
// per-instance `settings`); the content returned here is DECLARATIVE — the
// core renders it with its own theme, dark mode and translations.
//
// Each entry of WIDGETS is keyed by the widget `key`:
//   - get(ctx, { settings, language }): the content (onWidgetGet);
//   - action(ctx, { actionKey, params, settings }) (optional): a tapped
//     `button` carrying an `action` (onWidgetAction).
//
// The contents are computed from the last refresh (src/controller.js), which
// nudges the widgets every time: no weather request when a dashboard opens.
// test/widgets.test.js checks every content with `validateWidgetContent`.
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { WEATHER_SOURCES } from './controller.js';
import { REASONS, forecastPositions } from './engine.js';
import {
  FACADE_FEATURE,
  SUN_FEATURE,
  facadeGeometry,
  facadeIds,
  findFacade,
  sunIds,
} from './facades.js';
import {
  AUTOMATIC,
  PAUSED,
  UNKNOWN_FACADE,
  formatTime,
  localized,
  reasonLabel,
  textIn,
} from './i18n.js';
import { selectFacades } from './scenes.js';

const logger = createLogger({ name: 'widgets' });

export const WIDGET_KEYS = {
  FACADE: 'facade',
  SUN_WEATHER: 'sun_weather',
  OVERVIEW: 'overview',
};

export const WIDGET_ACTIONS = { PAUSE: 'pause', RESUME: 'resume' };

// Pause length of the widget buttons, in minutes.
export const WIDGET_PAUSE_MINUTES = 120;

// The core caches a content until this TTL; the controller nudges the
// widgets after every refresh, so the TTL is only a safety net.
const TTL_SECONDS = 900;

const REASON_COLORS = {
  [REASONS.WIND]: WIDGET_COLORS.DANGER,
  [REASONS.NIGHT]: WIDGET_COLORS.NEUTRAL,
  [REASONS.HEAT]: WIDGET_COLORS.WARNING,
  [REASONS.GLARE]: WIDGET_COLORS.INFO,
  [REASONS.SOLAR_GAIN]: WIDGET_COLORS.SUCCESS,
  [REASONS.CLOUDY]: WIDGET_COLORS.NEUTRAL,
  [REASONS.NO_SUN]: WIDGET_COLORS.NEUTRAL,
};

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const iso = (ms) => new Date(ms).toISOString();

const WEATHER_SOURCE_TEXT = {
  [WEATHER_SOURCES.LIVE]: {
    en: 'Open-Meteo',
    fr: 'Open-Meteo',
    de: 'Open-Meteo',
    es: 'Open-Meteo',
  },
  [WEATHER_SOURCES.STALE]: {
    en: 'Last forecast (offline)',
    fr: 'Dernière prévision (hors ligne)',
    de: 'Letzte Vorhersage (offline)',
    es: 'Última previsión (sin conexión)',
  },
  [WEATHER_SOURCES.CLEAR_SKY]: {
    en: 'Clear sky assumed (offline)',
    fr: 'Ciel dégagé supposé (hors ligne)',
    de: 'Klarer Himmel angenommen (offline)',
    es: 'Cielo despejado supuesto (sin conexión)',
  },
};

const LABELS = {
  position: { en: 'Position', fr: 'Position', de: 'Position', es: 'Posición' },
  irradiance: {
    en: 'On the façade',
    fr: 'Sur la façade',
    de: 'Auf der Fassade',
    es: 'En la fachada',
  },
  sunHeight: { en: 'Sun height', fr: 'Hauteur soleil', de: 'Sonnenhöhe', es: 'Altura del sol' },
  reason: { en: 'Reason', fr: 'Raison', de: 'Grund', es: 'Motivo' },
  automation: { en: 'Automation', fr: 'Automatisme', de: 'Automatik', es: 'Automatización' },
  sunOnFacade: {
    en: 'Sun on the façade',
    fr: 'Soleil sur la façade',
    de: 'Sonne auf der Fassade',
    es: 'Sol en la fachada',
  },
  weather: { en: 'Weather', fr: 'Météo', de: 'Wetter', es: 'Tiempo' },
  expected: {
    en: 'Expected position',
    fr: 'Position prévue',
    de: 'Erwartete Position',
    es: 'Posición prevista',
  },
  next12h: {
    en: 'Next 12 hours',
    fr: '12 prochaines heures',
    de: 'Nächste 12 Stunden',
    es: 'Próximas 12 horas',
  },
  cloudCover: { en: 'Clouds', fr: 'Nuages', de: 'Wolken', es: 'Nubes' },
  temperature: { en: 'Temperature', fr: 'Température', de: 'Temperatur', es: 'Temperatura' },
  gusts: { en: 'Gusts', fr: 'Rafales', de: 'Böen', es: 'Ráfagas' },
  uv: { en: 'UV index', fr: 'Indice UV', de: 'UV-Index', es: 'Índice UV' },
  irradianceForecast: {
    en: 'Irradiance',
    fr: 'Ensoleillement',
    de: 'Einstrahlung',
    es: 'Irradiancia',
  },
  sunrise: { en: 'Sunrise', fr: 'Lever du soleil', de: 'Sonnenaufgang', es: 'Salida del sol' },
  sunset: { en: 'Sunset', fr: 'Coucher du soleil', de: 'Sonnenuntergang', es: 'Puesta del sol' },
  maxToday: {
    en: "Today's maximum",
    fr: "Maximum aujourd'hui",
    de: 'Höchstwert heute',
    es: 'Máxima de hoy',
  },
  windProtection: {
    en: 'Wind protection',
    fr: 'Protection vent',
    de: 'Windschutz',
    es: 'Protección viento',
  },
  pause: { en: 'Pause 2 h', fr: 'Pause 2 h', de: 'Pause 2 Std.', es: 'Pausa 2 h' },
  pauseAll: {
    en: 'Pause all 2 h',
    fr: 'Tout en pause 2 h',
    de: 'Alle 2 Std. pausieren',
    es: 'Pausar todo 2 h',
  },
  resume: { en: 'Resume', fr: 'Reprendre', de: 'Fortsetzen', es: 'Reanudar' },
  resumeAll: { en: 'Resume all', fr: 'Tout reprendre', de: 'Alle fortsetzen', es: 'Reanudar todo' },
  yes: { en: 'Yes', fr: 'Oui', de: 'Ja', es: 'Sí' },
  no: { en: 'No', fr: 'Non', de: 'Nein', es: 'No' },
  active: { en: 'Active', fr: 'Active', de: 'Aktiv', es: 'Activa' },
  inactive: { en: 'Inactive', fr: 'Inactive', de: 'Inaktiv', es: 'Inactiva' },
};

const WAITING = {
  en: 'Waiting for the first refresh…',
  fr: 'En attente du premier rafraîchissement…',
  de: 'Warten auf die erste Aktualisierung…',
  es: 'Esperando la primera actualización…',
};

/** Content shown while no data can be displayed. */
function placeholder(ctx) {
  const blocker = ctx.controller.blocker();
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: blocker ?? WAITING }],
  };
}

const ready = (ctx) => ctx.controller.blocker() === null && ctx.controller.sun !== null;

function automationText(ctx, facade) {
  const { controller } = ctx;
  if (controller.isAutomatic(facade)) {
    return { value: AUTOMATIC, color: WIDGET_COLORS.SUCCESS };
  }
  const until = controller.runtimeOf(facade).paused_until;
  const timeZone = controller.forecast?.timezone;
  return {
    value: until
      ? localized((lang) => `${textIn(PAUSED, lang)} → ${formatTime(until, timeZone)}`)
      : PAUSED,
    color: WIDGET_COLORS.WARNING,
  };
}

const pauseButton = (label) => ({
  type: 'button',
  label,
  icon: 'pause',
  style: 'secondary',
  action: { key: WIDGET_ACTIONS.PAUSE, params: { minutes: WIDGET_PAUSE_MINUTES } },
});

const resumeButton = (label) => ({
  type: 'button',
  label,
  icon: 'play',
  style: 'primary',
  action: { key: WIDGET_ACTIONS.RESUME },
});

/** Toast of a pause / resume. */
function actionToast(actionKey, count) {
  return actionKey === WIDGET_ACTIONS.PAUSE
    ? localized(
        (lang) =>
          ({
            en: `Automation paused for 2 h (${count} façade(s))`,
            fr: `Automatisme en pause 2 h (${count} façade(s))`,
            de: `Automatik 2 Std. pausiert (${count} Fassade(n))`,
            es: `Automatización en pausa 2 h (${count} fachada(s))`,
          })[lang],
      )
    : localized(
        (lang) =>
          ({
            en: `Automation resumed (${count} façade(s))`,
            fr: `Automatisme repris (${count} façade(s))`,
            de: `Automatik fortgesetzt (${count} Fassade(n))`,
            es: `Automatización reanudada (${count} fachada(s))`,
          })[lang],
      );
}

async function runAction(ctx, actionKey, facades, params) {
  if (actionKey === WIDGET_ACTIONS.PAUSE) {
    await ctx.controller.pause(facades, Number(params.minutes) || WIDGET_PAUSE_MINUTES);
  } else if (actionKey === WIDGET_ACTIONS.RESUME) {
    await ctx.controller.resume(facades);
  } else {
    throw new Error(`Unknown widget action: ${actionKey}`);
  }
  return actionToast(actionKey, facades.length);
}

export const WIDGETS = {
  // One façade: live position and power, the reason, the automation, and the
  // positions expected over the next 12 hours.
  [WIDGET_KEYS.FACADE]: {
    async get(ctx, { settings = {} } = {}) {
      logger.debug(`onWidgetGet <- ${WIDGET_KEYS.FACADE}`);
      if (!ready(ctx)) {
        return placeholder(ctx);
      }
      const { controller, gladys } = ctx;
      const facade = findFacade(gladys, controller.facades, settings.facade);
      if (!facade) {
        return {
          ttl_seconds: 300,
          components: [{ type: 'text', variant: 'body', text: UNKNOWN_FACADE }],
        };
      }
      const ids = facadeIds(gladys, facade);
      const runtime = controller.runtimeOf(facade);
      const reason = runtime.reason ?? controller.decisions[facade.id]?.reason;
      const automatic = controller.isAutomatic(facade);

      const components = [
        { type: 'text', variant: 'heading', text: truncate(facade.name, 40) },
        {
          type: 'value',
          label: LABELS.position,
          icon: 'sliders',
          device_feature: ids.feature(FACADE_FEATURE.POSITION),
        },
        {
          type: 'value',
          label: LABELS.irradiance,
          icon: 'sun',
          device_feature: ids.feature(FACADE_FEATURE.IRRADIANCE),
        },
        {
          type: 'value',
          label: LABELS.sunHeight,
          icon: 'sunrise',
          value: Math.round(controller.sun.elevation),
          unit: '°',
        },
      ];

      const forecast = controller.forecast;
      if (forecast && forecast.hourly.length > 1) {
        const points = forecastPositions({
          facade: facadeGeometry(facade),
          hourly: forecast.hourly,
          location: controller.location,
          config: ctx.getConfig(),
          temperatureMax: forecast.today.temperature_max,
        });
        components.push({
          type: 'chart',
          chart_type: 'stepline',
          title: LABELS.next12h,
          unit: '%',
          now_marker: true,
          series: [
            {
              name: LABELS.expected,
              points: points.map((p) => ({ t: iso(p.time), v: p.position })),
            },
          ],
        });
      }

      const status = [
        {
          label: LABELS.reason,
          icon: 'info',
          value: reason ? localized((lang) => reasonLabel(reason, lang)) : '-',
          color: REASON_COLORS[reason] ?? WIDGET_COLORS.NEUTRAL,
        },
        { label: LABELS.automation, icon: 'cpu', ...automationText(ctx, facade) },
        {
          label: LABELS.sunOnFacade,
          icon: 'sun',
          value: runtime.sun_on_facade ? LABELS.yes : LABELS.no,
          color: runtime.sun_on_facade ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
        },
      ];
      if (controller.weatherSource !== WEATHER_SOURCES.LIVE) {
        status.push({
          label: LABELS.weather,
          icon: 'cloud-off',
          value: WEATHER_SOURCE_TEXT[controller.weatherSource],
          color: WIDGET_COLORS.WARNING,
        });
      }
      components.push({ type: 'status', items: status });
      components.push(automatic ? pauseButton(LABELS.pause) : resumeButton(LABELS.resume));
      return { ttl_seconds: TTL_SECONDS, components };
    },

    async action(ctx, { actionKey, params = {}, settings = {} }) {
      logger.info(`onWidgetAction <- ${WIDGET_KEYS.FACADE}.${actionKey}`);
      // An empty setting must not mean "every façade" here.
      if (!settings.facade) {
        throw new Error(UNKNOWN_FACADE.en);
      }
      return runAction(ctx, actionKey, selectFacades(ctx, settings.facade), params);
    },
  },

  // The sky: live sun and weather tiles, the irradiance expected over the
  // next 12 hours, sunrise, sunset, today's maximum and the wind protection.
  [WIDGET_KEYS.SUN_WEATHER]: {
    async get(ctx) {
      logger.debug(`onWidgetGet <- ${WIDGET_KEYS.SUN_WEATHER}`);
      const { controller, gladys } = ctx;
      if (!controller.location || !controller.sun) {
        return placeholder(ctx);
      }
      const ids = sunIds(gladys);
      const tile = (key, label, icon) => ({
        type: 'value',
        label,
        icon,
        device_feature: ids.feature(key),
      });
      const components = [
        tile(SUN_FEATURE.ELEVATION, LABELS.sunHeight, 'sunrise'),
        tile(SUN_FEATURE.CLOUD_COVER, LABELS.cloudCover, 'cloud'),
        tile(SUN_FEATURE.TEMPERATURE, LABELS.temperature, 'thermometer'),
        tile(SUN_FEATURE.WIND_GUSTS, LABELS.gusts, 'wind'),
        tile(SUN_FEATURE.UV_INDEX, LABELS.uv, 'sun'),
      ];
      const { sunrise, sunset } = controller.sunEvents();
      const forecast = controller.forecast;
      if (forecast && forecast.hourly.length > 1) {
        const last = forecast.hourly.at(-1).time;
        const annotations = [
          [sunrise, LABELS.sunrise],
          [sunset, LABELS.sunset],
        ]
          .filter(([time]) => time && time <= last)
          .map(([time, label]) => ({
            t: iso(time),
            label: localized((lang) => truncate(textIn(label, lang), 16)),
            color: WIDGET_COLORS.WARNING,
          }));
        components.push({
          type: 'chart',
          chart_type: 'area',
          title: LABELS.next12h,
          unit: 'W/m²',
          now_marker: true,
          series: [
            {
              name: LABELS.irradianceForecast,
              points: forecast.hourly.map((p) => ({ t: iso(p.time), v: p.ghi ?? 0 })),
            },
          ],
          ...(annotations.length > 0 ? { annotations } : {}),
        });
      }
      const timeZone = forecast?.timezone;
      const status = [];
      if (sunrise) {
        status.push({
          label: LABELS.sunrise,
          icon: 'sunrise',
          value: formatTime(sunrise, timeZone),
        });
      }
      if (sunset) {
        status.push({ label: LABELS.sunset, icon: 'sunset', value: formatTime(sunset, timeZone) });
      }
      const maxToday = controller.weather?.temperature_max;
      if (maxToday != null) {
        status.push({
          label: LABELS.maxToday,
          icon: 'thermometer',
          value: `${Math.round(maxToday)} °C`,
          color:
            maxToday >= ctx.getConfig().heat_threshold
              ? WIDGET_COLORS.WARNING
              : WIDGET_COLORS.NEUTRAL,
        });
      }
      const wind = ctx.store.state.wind_active;
      status.push({
        label: LABELS.windProtection,
        icon: 'wind',
        value: wind ? LABELS.active : LABELS.inactive,
        color: wind ? WIDGET_COLORS.DANGER : WIDGET_COLORS.SUCCESS,
      });
      status.push({
        label: LABELS.weather,
        icon: controller.weatherSource === WEATHER_SOURCES.LIVE ? 'cloud' : 'cloud-off',
        value: WEATHER_SOURCE_TEXT[controller.weatherSource],
        color:
          controller.weatherSource === WEATHER_SOURCES.LIVE
            ? WIDGET_COLORS.NEUTRAL
            : WIDGET_COLORS.WARNING,
      });
      components.push({ type: 'status', items: status });
      return { ttl_seconds: TTL_SECONDS, components };
    },
  },

  // Every façade at a glance: position and reason, pause or resume them all.
  [WIDGET_KEYS.OVERVIEW]: {
    async get(ctx) {
      logger.debug(`onWidgetGet <- ${WIDGET_KEYS.OVERVIEW}`);
      if (!ready(ctx)) {
        return placeholder(ctx);
      }
      const { controller } = ctx;
      const facades = controller.facades;
      const items = facades.slice(0, 10).map((facade) => {
        const runtime = controller.runtimeOf(facade);
        const position = runtime.recommended == null ? '-' : `${runtime.recommended} %`;
        const paused = !controller.isAutomatic(facade);
        return {
          label: truncate(facade.name, 40),
          icon: paused ? 'pause' : 'sliders',
          value: localized((lang) =>
            truncate(
              `${position} · ${paused ? textIn(PAUSED, lang) : reasonLabel(runtime.reason, lang)}`,
              40,
            ),
          ),
          color: paused
            ? WIDGET_COLORS.WARNING
            : (REASON_COLORS[runtime.reason] ?? WIDGET_COLORS.NEUTRAL),
        };
      });
      const components = [{ type: 'status', items }];
      if (facades.length > 10) {
        components.unshift({
          type: 'text',
          variant: 'caption',
          text: localized(
            (lang) =>
              ({
                en: `The first 10 of ${facades.length} façades`,
                fr: `Les 10 premières façades sur ${facades.length}`,
                de: `Die ersten 10 von ${facades.length} Fassaden`,
                es: `Las 10 primeras de ${facades.length} fachadas`,
              })[lang],
          ),
        });
      }
      const anyPaused = facades.some((facade) => !controller.isAutomatic(facade));
      const anyAutomatic = facades.some((facade) => controller.isAutomatic(facade));
      if (anyAutomatic) {
        components.push(pauseButton(LABELS.pauseAll));
      }
      if (anyPaused) {
        components.push(resumeButton(LABELS.resumeAll));
      }
      return { ttl_seconds: TTL_SECONDS, components };
    },

    async action(ctx, { actionKey, params = {} }) {
      logger.info(`onWidgetAction <- ${WIDGET_KEYS.OVERVIEW}.${actionKey}`);
      return runAction(ctx, actionKey, selectFacades(ctx, null), params);
    },
  },
};

/**
 * Freshness nudge: the core re-pulls the widgets now instead of waiting for
 * the TTL (rate-limited to 1 per 10 s per widget, dropped while
 * disconnected).
 */
export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
}
