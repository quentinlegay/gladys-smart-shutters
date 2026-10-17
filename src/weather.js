// -----------------------------------------------------------------------------
// Weather driver: the free Open-Meteo forecast API (no account, no key).
// One request per refresh brings everything the engine needs for every
// façade: the current temperature, clouds, gusts and the three radiation
// components (global, direct normal, diffuse), the hourly forecast of the next
// hours (the widgets' outlook) and today's maximum temperature.
//
// `fetch` is injectable: the tests never touch the network.
// -----------------------------------------------------------------------------

export const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

const REQUEST_TIMEOUT_MS = 15000;
// Hours of forecast kept for the widgets' outlook.
export const FORECAST_HOURS = 12;

const CURRENT = [
  'temperature_2m',
  'cloud_cover',
  'wind_speed_10m',
  'wind_gusts_10m',
  'shortwave_radiation',
  'direct_normal_irradiance',
  'diffuse_radiation',
];
const HOURLY = [...CURRENT, 'uv_index'];
const DAILY = ['temperature_2m_max'];

export class WeatherError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'WeatherError';
    this.code = code;
  }
}

/** The request URL for a location (no personal data but the coordinates). */
export function forecastUrl({ latitude, longitude }) {
  const params = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    current: CURRENT.join(','),
    hourly: HOURLY.join(','),
    daily: DAILY.join(','),
    timezone: 'auto',
    forecast_days: '2',
    wind_speed_unit: 'kmh',
    timeformat: 'unixtime',
  });
  return `${OPEN_METEO_URL}?${params}`;
}

const numberOrNull = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/** Weather variables of one Open-Meteo point (current or hourly index). */
function pick(block, index) {
  const at = (key) => numberOrNull(index === undefined ? block[key] : block[key]?.[index]);
  return {
    temperature: at('temperature_2m'),
    cloud_cover: at('cloud_cover'),
    wind_speed: at('wind_speed_10m'),
    wind_gusts: at('wind_gusts_10m'),
    ghi: at('shortwave_radiation'),
    dni: at('direct_normal_irradiance'),
    dhi: at('diffuse_radiation'),
  };
}

/**
 * Turn an Open-Meteo answer into the integration's weather snapshot.
 * Times are epoch milliseconds.
 * @param {object} json - Open-Meteo forecast answer (timeformat=unixtime)
 * @param {number} now - epoch ms
 */
export function parseForecast(json, now) {
  if (!json?.current || !json?.hourly?.time || !json?.daily?.time) {
    throw new WeatherError('INVALID_RESPONSE', 'Unexpected Open-Meteo answer');
  }
  const hourlyTimes = json.hourly.time.map((seconds) => seconds * 1000);
  const hourly = hourlyTimes
    .map((time, index) => ({
      time,
      ...pick(json.hourly, index),
      uv_index: numberOrNull(json.hourly.uv_index?.[index]),
    }))
    .filter((point) => point.time > now - 3600000);

  // The hour slot containing now carries the UV index (not a `current` field).
  const currentHour = hourly.find((point) => point.time <= now && now < point.time + 3600000);

  // Daily slots start at the local midnight of the place.
  const dayIndex = Math.max(
    0,
    json.daily.time.findLastIndex((seconds) => seconds * 1000 <= now),
  );
  const currentTime = numberOrNull(json.current.time);

  return {
    fetched_at: now,
    timezone: typeof json.timezone === 'string' ? json.timezone : 'UTC',
    utc_offset_seconds: numberOrNull(json.utc_offset_seconds) ?? 0,
    current: {
      time: currentTime == null ? now : currentTime * 1000,
      ...pick(json.current),
      uv_index: currentHour?.uv_index ?? null,
    },
    today: {
      temperature_max: numberOrNull(json.daily.temperature_2m_max?.[dayIndex]),
    },
    // The current hour slot, then the next ones.
    hourly: hourly.slice(0, FORECAST_HOURS + 1),
  };
}

export function createWeatherClient({ fetch = globalThis.fetch, now = Date.now } = {}) {
  return {
    /** Current conditions and outlook at a location. Throws a WeatherError. */
    async forecast(location) {
      let response;
      try {
        response = await fetch(forecastUrl(location), {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (err) {
        throw new WeatherError('NETWORK', `Open-Meteo unreachable: ${err.message}`);
      }
      if (response.status === 429) {
        throw new WeatherError('RATE_LIMITED', 'Open-Meteo rate limit reached');
      }
      if (!response.ok) {
        throw new WeatherError(
          `HTTP_${response.status}`,
          `Open-Meteo answered HTTP ${response.status}`,
        );
      }
      let json;
      try {
        json = await response.json();
      } catch {
        throw new WeatherError('INVALID_RESPONSE', 'Open-Meteo answered invalid JSON');
      }
      return parseForecast(json, now());
    },
  };
}
