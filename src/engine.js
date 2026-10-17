// -----------------------------------------------------------------------------
// The decision engine, pure functions: from the sun, the weather and the
// settings, the position each façade's shutters should take, and why.
//
// Positions follow the Gladys shutter convention: 0 % = closed, 100 % = open.
//
// Priorities, from the strongest:
//   1. wind      — gusts above the threshold: the wind position, at once
//                  (exterior blinds and rolling shutters are damaged by wind);
//   2. night     — the sun below the night elevation: the night position;
//   3. shading   — the sun reaches the façade with enough power and the sky
//                  is not overcast; what to do then depends on the heat:
//                    hot day  → heat position (keep the heat out),
//                    cold day → open (free solar heating),
//                    mild day → shade position (glare), if enabled;
//   4. otherwise — open: no sun on the façade, or clouds.
//
// Hysteresis keeps a passing cloud from moving the shutters: shading starts
// at the irradiance threshold and stops at 75 % of it; wind protection starts
// at the gust threshold and stops at 80 % of it. The anti-flapping delay and
// minimum step are applied by `stabilize`.
// -----------------------------------------------------------------------------

import { facadeIrradiance, sunPosition, sunReachesFacade } from './solar.js';

export const OPEN_POSITION = 100;

export const REASONS = {
  WIND: 'wind',
  NIGHT: 'night',
  HEAT: 'heat',
  GLARE: 'glare',
  SOLAR_GAIN: 'solar_gain',
  CLOUDY: 'cloudy',
  NO_SUN: 'no_sun',
};

// Reasons applied without waiting for the anti-flapping delay, and whose end
// is applied at once too.
const IMMEDIATE_REASONS = new Set([REASONS.WIND, REASONS.NIGHT]);

export const THERMAL = { HOT: 'hot', MILD: 'mild', COLD: 'cold' };

const SHADING_RELEASE = 0.75;
const WIND_RELEASE = 0.8;
const CLOUD_RELEASE_MARGIN = 10;

/** Whether the wind protection is (still) active. */
export function windActive(weather, config, wasActive = false) {
  if (!config.wind_threshold || weather?.wind_gusts == null) {
    return false;
  }
  const threshold = wasActive ? config.wind_threshold * WIND_RELEASE : config.wind_threshold;
  return weather.wind_gusts >= threshold;
}

/**
 * Hot, mild or cold day. With the anticipation on, a day whose forecast
 * maximum reaches the heat threshold is hot from the morning: the shutters
 * keep the heat out before the room has warmed up.
 */
export function thermalState(weather, config) {
  const temperature = weather?.temperature;
  if (temperature == null) {
    return THERMAL.MILD;
  }
  const maxToday = weather.temperature_max;
  if (
    temperature >= config.heat_threshold ||
    (config.anticipate_heat && maxToday != null && maxToday >= config.heat_threshold)
  ) {
    return THERMAL.HOT;
  }
  return temperature < config.cold_threshold ? THERMAL.COLD : THERMAL.MILD;
}

/**
 * The position a façade's shutters should take now, before anti-flapping.
 * @param {object} input
 * @param {object} input.facade - see src/facades.js
 * @param {{ elevation: number, azimuth: number }} input.sun
 * @param {object} input.weather - temperature, temperature_max, cloud_cover,
 *   wind_gusts, ghi, dni, dhi (null when unknown)
 * @param {object} input.config - normalized config
 * @param {boolean} [input.wind] - wind protection active (see windActive)
 * @param {boolean} [input.wasShading] - the façade was shaded at the last run
 * @returns {{ position: number, reason: string, sun_on_facade: boolean,
 *   irradiance: number, shading: boolean, thermal: string }}
 */
export function decide({ facade, sun, weather, config, wind = false, wasShading = false }) {
  const onFacade = sunReachesFacade(sun, facade);
  const irradiance = facadeIrradiance(sun, facade, {
    ghi: weather.ghi ?? 0,
    dni: weather.dni ?? 0,
    dhi: weather.dhi ?? 0,
  });
  const thermal = thermalState(weather, config);
  const base = { sun_on_facade: onFacade, irradiance, thermal };

  const threshold = wasShading
    ? config.irradiance_threshold * SHADING_RELEASE
    : config.irradiance_threshold;
  const cloudLimit = wasShading
    ? Math.min(100, config.cloud_cover_threshold + CLOUD_RELEASE_MARGIN)
    : config.cloud_cover_threshold;
  const overcast = weather.cloud_cover != null && weather.cloud_cover >= cloudLimit;
  const shading = onFacade && irradiance >= threshold && !overcast;

  if (wind) {
    return { ...base, shading, position: config.wind_position, reason: REASONS.WIND };
  }
  if (config.night_mode && sun.elevation < config.night_elevation) {
    return { ...base, shading: false, position: config.night_position, reason: REASONS.NIGHT };
  }
  if (!shading) {
    const reason = onFacade ? REASONS.CLOUDY : REASONS.NO_SUN;
    return { ...base, shading, position: OPEN_POSITION, reason };
  }
  if (thermal === THERMAL.HOT) {
    return { ...base, shading, position: facade.heat_position, reason: REASONS.HEAT };
  }
  if (thermal === THERMAL.MILD && config.glare_protection) {
    return { ...base, shading, position: facade.shade_position, reason: REASONS.GLARE };
  }
  return { ...base, shading, position: OPEN_POSITION, reason: REASONS.SOLAR_GAIN };
}

/**
 * Anti-flapping: whether a decision replaces the position last applied.
 * Wind and night (entering or leaving them) apply at once; any other change
 * waits `min_change_interval` minutes after the previous one and must move
 * the shutters by at least `min_position_delta` points.
 * @param {object} decision - from decide()
 * @param {{ position: number|null, reason: string|null, changed_at: number|null }} previous
 * @returns {{ position: number, changed: boolean }}
 */
export function stabilize(decision, previous, config, now) {
  if (previous?.position == null) {
    return { position: decision.position, changed: true };
  }
  if (decision.position === previous.position) {
    return { position: previous.position, changed: false };
  }
  const immediate =
    IMMEDIATE_REASONS.has(decision.reason) || IMMEDIATE_REASONS.has(previous.reason);
  if (!immediate) {
    if (Math.abs(decision.position - previous.position) < config.min_position_delta) {
      return { position: previous.position, changed: false };
    }
    const elapsed = now - (previous.changed_at ?? 0);
    if (elapsed < config.min_change_interval * 60000) {
      return { position: previous.position, changed: false };
    }
  }
  return { position: decision.position, changed: true };
}

/**
 * The positions the engine expects over the next hours, from the hourly
 * forecast (no anti-flapping: what the sky alone asks for).
 * @param {object} facade
 * @param {Array<object>} hourly - forecast points `{ time, ...weather }`
 * @returns {Array<{ time: number, position: number, reason: string }>}
 */
export function forecastPositions({ facade, hourly, location, config, temperatureMax }) {
  let wind = false;
  let shading = false;
  return hourly.map((point) => {
    const sun = sunPosition(point.time, location.latitude, location.longitude);
    const weather = { ...point, temperature_max: temperatureMax };
    wind = windActive(weather, config, wind);
    const decision = decide({ facade, sun, weather, config, wind, wasShading: shading });
    shading = decision.shading;
    return { time: point.time, position: decision.position, reason: decision.reason };
  });
}
