// -----------------------------------------------------------------------------
// The Open-Meteo driver: request, parsing, errors — against a fake `fetch`.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORECAST_HOURS, createWeatherClient, forecastUrl, parseForecast } from '../src/weather.js';
import { NOW, PARIS_HOUSE, createFakeOpenMeteo } from './helpers/fakeOpenMeteo.js';

test('the request asks for every variable the engine needs, in km/h and unix time', () => {
  const url = new URL(forecastUrl(PARIS_HOUSE));
  assert.equal(url.origin + url.pathname, 'https://api.open-meteo.com/v1/forecast');
  assert.equal(url.searchParams.get('latitude'), '48.8566');
  assert.equal(url.searchParams.get('wind_speed_unit'), 'kmh');
  assert.equal(url.searchParams.get('timeformat'), 'unixtime');
  for (const variable of [
    'direct_normal_irradiance',
    'diffuse_radiation',
    'cloud_cover',
    'wind_gusts_10m',
  ]) {
    assert.ok(url.searchParams.get('current').includes(variable), variable);
  }
  assert.ok(url.searchParams.get('hourly').includes('uv_index'));
  assert.equal(url.searchParams.get('daily'), 'temperature_2m_max');
});

test('the answer becomes the current conditions, today and the next hours', async () => {
  const meteo = createFakeOpenMeteo();
  meteo.hourly[2] = { cloud_cover: 90 };
  const weather = await createWeatherClient({ fetch: meteo.fetch, now: () => NOW }).forecast(
    PARIS_HOUSE,
  );
  assert.equal(weather.timezone, 'Europe/Paris');
  assert.equal(weather.current.temperature, 22);
  assert.equal(weather.current.dni, 750);
  assert.equal(weather.current.uv_index, 7, 'from the hourly slot of now');
  assert.equal(weather.today.temperature_max, 23);
  assert.equal(weather.hourly.length, FORECAST_HOURS + 1);
  assert.equal(weather.hourly[0].time, NOW, 'starts with the current hour');
  assert.equal(weather.hourly[2].cloud_cover, 90);
});

test('a malformed answer is refused', () => {
  assert.throws(() => parseForecast({}, NOW), { code: 'INVALID_RESPONSE' });
});

test('network, rate limit and HTTP errors carry a code', async () => {
  const meteo = createFakeOpenMeteo();
  const client = createWeatherClient({ fetch: meteo.fetch, now: () => NOW });
  meteo.failure = 'network';
  await assert.rejects(client.forecast(PARIS_HOUSE), { code: 'NETWORK' });
  meteo.failure = 429;
  await assert.rejects(client.forecast(PARIS_HOUSE), { code: 'RATE_LIMITED' });
  meteo.failure = 500;
  await assert.rejects(client.forecast(PARIS_HOUSE), { code: 'HTTP_500' });
});
