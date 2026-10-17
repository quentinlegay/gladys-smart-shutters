// -----------------------------------------------------------------------------
// A fake Open-Meteo forecast API: an injectable `fetch` answering the
// forecast requests with the weather the test sets, in the exact shape of the
// real API (timeformat=unixtime). Tests never touch the network.
// -----------------------------------------------------------------------------

// A summer day in Paris: 2026-07-15, 14:00 local time (12:00 UTC), the sun
// high in the south.
export const NOW = Date.parse('2026-07-15T12:00:00Z');

export const PARIS_HOUSE = {
  id: 'house-1',
  name: 'Home',
  selector: 'home',
  latitude: 48.8566,
  longitude: 2.3522,
};

export const SUNNY = {
  temperature: 22,
  cloud_cover: 10,
  wind_speed: 10,
  wind_gusts: 20,
  ghi: 800,
  dni: 750,
  dhi: 120,
  uv_index: 7,
  temperature_max: 23,
};

/**
 * @param {object} [options]
 * @param {() => number} [options.now]
 */
export function createFakeOpenMeteo({ now = () => NOW } = {}) {
  const fake = {
    weather: { ...SUNNY },
    // Hourly overrides by hour offset from now: { 3: { cloud_cover: 100 } }.
    hourly: {},
    // 'network' | number (an HTTP status) | null
    failure: null,
    requests: [],

    async fetch(url) {
      fake.requests.push(String(url));
      if (fake.failure === 'network') {
        throw new TypeError('fetch failed');
      }
      if (typeof fake.failure === 'number') {
        return new Response('{"error":true}', { status: fake.failure });
      }
      return Response.json(fake.body());
    },

    body() {
      const w = fake.weather;
      const current = Math.floor(now() / 900000) * 900;
      const firstHour = Math.floor(now() / 3600000) * 3600 - 24 * 3600;
      const hours = Array.from({ length: 72 }, (_, i) => firstHour + i * 3600);
      const value = (key, i) => {
        const offset = Math.round((hours[i] * 1000 - now()) / 3600000);
        return fake.hourly[offset]?.[key] ?? w[key];
      };
      const series = (key) => hours.map((_, i) => value(key, i));
      const midnight = Math.floor((now() + 7200000) / 86400000) * 86400 - 7200;
      return {
        latitude: 48.86,
        longitude: 2.35,
        timezone: 'Europe/Paris',
        utc_offset_seconds: 7200,
        current: {
          time: current,
          interval: 900,
          temperature_2m: w.temperature,
          cloud_cover: w.cloud_cover,
          wind_speed_10m: w.wind_speed,
          wind_gusts_10m: w.wind_gusts,
          shortwave_radiation: w.ghi,
          direct_normal_irradiance: w.dni,
          diffuse_radiation: w.dhi,
        },
        hourly: {
          time: hours,
          temperature_2m: series('temperature'),
          cloud_cover: series('cloud_cover'),
          wind_speed_10m: series('wind_speed'),
          wind_gusts_10m: series('wind_gusts'),
          shortwave_radiation: series('ghi'),
          direct_normal_irradiance: series('dni'),
          diffuse_radiation: series('dhi'),
          uv_index: series('uv_index'),
        },
        daily: {
          time: [midnight, midnight + 86400],
          temperature_2m_max: [w.temperature_max, w.temperature_max],
        },
      };
    },
  };
  return fake;
}
