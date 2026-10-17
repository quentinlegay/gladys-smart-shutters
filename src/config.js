// -----------------------------------------------------------------------------
// Integration configuration: the global settings of the Configuration screen
// (`config_schema` of the manifest). The façades themselves are not here:
// they are added with the "Add a façade" action and kept in /data (see
// src/facades.js), because a flat form cannot hold a list.
//
// This module only provides the defaults and normalizes the received object,
// so the rest of the code never deals with strings, `undefined` or values out
// of bounds.
// -----------------------------------------------------------------------------

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest (test/manifest.test.js).
export const DEFAULT_CONFIG = {
  // Selector of the Gladys house whose location is used ('' = the first
  // house with coordinates).
  house: '',
  // Minutes between two weather reads and decisions.
  refresh_interval: 10,
  // Power on a façade (W/m²) above which the sun is a problem.
  irradiance_threshold: 200,
  // Cloud cover (%) at or above which the sun is considered hidden.
  cloud_cover_threshold: 80,
  // Outdoor temperature (°C) from which the shutters protect from the heat.
  heat_threshold: 25,
  // Outdoor temperature (°C) below which the sun is welcome (free heating).
  cold_threshold: 15,
  // Shade from the morning when today's forecast maximum reaches the heat
  // threshold, before the room warms up.
  anticipate_heat: true,
  // Glare protection between the cold and heat thresholds.
  glare_protection: true,
  // Wind gusts (km/h) from which the shutters move to the wind position
  // (0 = disabled).
  wind_threshold: 50,
  wind_position: 100,
  // Close at night: below this sun elevation (degrees) it is night.
  night_mode: true,
  night_elevation: -4,
  night_position: 0,
  // Anti-flapping: a new position is sent at most every N minutes, and only
  // when it differs by at least N points (wind and night always apply at once).
  min_change_interval: 20,
  min_position_delta: 10,
};

export const LIMITS = {
  refresh_interval: [5, 60],
  irradiance_threshold: [20, 1200],
  cloud_cover_threshold: [10, 100],
  heat_threshold: [10, 45],
  cold_threshold: [-20, 30],
  wind_threshold: [0, 150],
  wind_position: [0, 100],
  night_elevation: [-12, 5],
  night_position: [0, 100],
  min_change_interval: [0, 240],
  min_position_delta: [0, 50],
};

const BOOLEAN_KEYS = ['anticipate_heat', 'glare_protection', 'night_mode'];

/** A finite number within bounds, or the fallback. */
export function toBoundedNumber(value, [min, max], fallback) {
  if (value === '' || value === null || value === undefined) {
    return fallback;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}

/** A form boolean: the config may carry "true"/"false" strings. */
export function toBoolean(value, fallback) {
  if (value === true || value === 'true' || value === 1 || value === '1') {
    return true;
  }
  if (value === false || value === 'false' || value === 0 || value === '0') {
    return false;
  }
  return fallback;
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const config = { ...DEFAULT_CONFIG, house: typeof raw.house === 'string' ? raw.house : '' };
  for (const [key, bounds] of Object.entries(LIMITS)) {
    config[key] = toBoundedNumber(raw[key], bounds, DEFAULT_CONFIG[key]);
  }
  for (const key of BOOLEAN_KEYS) {
    config[key] = toBoolean(raw[key], DEFAULT_CONFIG[key]);
  }
  // A cold threshold above the heat one would make every sunny day both.
  if (config.cold_threshold >= config.heat_threshold) {
    config.cold_threshold = config.heat_threshold - 1;
  }
  return config;
}
