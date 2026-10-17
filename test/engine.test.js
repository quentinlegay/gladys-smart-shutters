// -----------------------------------------------------------------------------
// The decision engine: priorities, thermal states, hysteresis, anti-flapping.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig } from '../src/config.js';
import {
  REASONS,
  THERMAL,
  decide,
  forecastPositions,
  stabilize,
  thermalState,
  windActive,
} from '../src/engine.js';

const config = normalizeConfig();
const facade = {
  azimuth: 180,
  opening_angle: 80,
  min_elevation: 5,
  max_elevation: 90,
  shade_position: 30,
  heat_position: 10,
};
const SUN = { elevation: 35, azimuth: 190 };
const SUNNY = {
  temperature: 20,
  temperature_max: 21,
  cloud_cover: 10,
  wind_gusts: 15,
  ghi: 700,
  dni: 750,
  dhi: 100,
};

const run = (overrides = {}) => decide({ facade, sun: SUN, weather: SUNNY, config, ...overrides });

test('mild sunny day: glare protection on the sunny façade', () => {
  const decision = run();
  assert.equal(decision.reason, REASONS.GLARE);
  assert.equal(decision.position, 30);
  assert.equal(decision.sun_on_facade, true);
  assert.ok(decision.irradiance >= config.irradiance_threshold);
});

test('glare protection can be turned off', () => {
  const decision = run({ config: { ...config, glare_protection: false } });
  assert.equal(decision.reason, REASONS.SOLAR_GAIN);
  assert.equal(decision.position, 100);
});

test('hot day: the heat position; cold day: the sun is let in', () => {
  assert.deepEqual(
    [
      run({ weather: { ...SUNNY, temperature: 28 } }).reason,
      run({ weather: { ...SUNNY, temperature: 28 } }).position,
    ],
    [REASONS.HEAT, 10],
  );
  const cold = run({ weather: { ...SUNNY, temperature: 5, temperature_max: 8 } });
  assert.equal(cold.reason, REASONS.SOLAR_GAIN);
  assert.equal(cold.position, 100);
});

test('a hot forecast protects from the morning, unless the anticipation is off', () => {
  const morning = { ...SUNNY, temperature: 19, temperature_max: 31 };
  assert.equal(thermalState(morning, config), THERMAL.HOT);
  assert.equal(thermalState(morning, { ...config, anticipate_heat: false }), THERMAL.MILD);
  assert.equal(thermalState({ temperature: null }, config), THERMAL.MILD);
});

test('no sun on the façade, or an overcast sky: open', () => {
  const behind = run({ sun: { elevation: 35, azimuth: 20 } });
  assert.equal(behind.reason, REASONS.NO_SUN);
  assert.equal(behind.position, 100);
  const overcast = run({ weather: { ...SUNNY, cloud_cover: 95 } });
  assert.equal(overcast.reason, REASONS.CLOUDY);
  const weak = run({ weather: { ...SUNNY, ghi: 150, dni: 0, dhi: 150 } });
  assert.equal(weak.reason, REASONS.CLOUDY);
});

test('night comes before the sun, wind before everything', () => {
  const night = run({ sun: { elevation: -10, azimuth: 320 } });
  assert.equal(night.reason, REASONS.NIGHT);
  assert.equal(night.position, 0);
  assert.equal(
    run({ sun: { elevation: -10, azimuth: 320 }, config: { ...config, night_mode: false } }).reason,
    REASONS.NO_SUN,
  );
  const wind = run({ wind: true, sun: { elevation: -10, azimuth: 320 } });
  assert.equal(wind.reason, REASONS.WIND);
  assert.equal(wind.position, 100);
});

test('wind protection has a hysteresis, and can be disabled', () => {
  assert.equal(windActive({ wind_gusts: 49 }, config, false), false);
  assert.equal(windActive({ wind_gusts: 50 }, config, false), true);
  assert.equal(windActive({ wind_gusts: 45 }, config, true), true, 'still active above 80 %');
  assert.equal(windActive({ wind_gusts: 39 }, config, true), false);
  assert.equal(windActive({ wind_gusts: 120 }, { ...config, wind_threshold: 0 }, false), false);
  assert.equal(windActive({ wind_gusts: null }, config, true), false);
});

test('shading has a hysteresis: a slightly weaker sun keeps the shutters down', () => {
  // ~180 W/m² on the façade: under the threshold, above 75 % of it.
  const weather = { ...SUNNY, ghi: 300, dni: 100, dhi: 160 };
  const fresh = run({ weather });
  const ongoing = run({ weather, wasShading: true });
  assert.ok(fresh.irradiance < 200 && fresh.irradiance >= 150, `irradiance ${fresh.irradiance}`);
  assert.equal(fresh.shading, false);
  assert.equal(ongoing.shading, true);
  assert.equal(ongoing.reason, REASONS.GLARE);
});

test('stabilize: the first decision applies, small and early moves wait', () => {
  const now = 10 * 3600000;
  const glare = { position: 30, reason: REASONS.GLARE };
  assert.deepEqual(stabilize(glare, {}, config, now), { position: 30, changed: true });

  const previous = { position: 100, reason: REASONS.NO_SUN, changed_at: now - 5 * 60000 };
  assert.deepEqual(
    stabilize(glare, previous, config, now),
    { position: 100, changed: false },
    'too early',
  );
  assert.deepEqual(stabilize(glare, { ...previous, changed_at: now - 25 * 60000 }, config, now), {
    position: 30,
    changed: true,
  });
  assert.deepEqual(
    stabilize({ position: 95, reason: REASONS.GLARE }, { ...previous, changed_at: 0 }, config, now),
    { position: 100, changed: false },
    'too small',
  );
});

test('stabilize: wind and night apply at once, entering and leaving', () => {
  const now = 10 * 3600000;
  const recent = { position: 30, reason: REASONS.GLARE, changed_at: now - 60000 };
  assert.equal(
    stabilize({ position: 100, reason: REASONS.WIND }, recent, config, now).changed,
    true,
  );
  const night = { position: 0, reason: REASONS.NIGHT, changed_at: now - 60000 };
  assert.equal(
    stabilize({ position: 100, reason: REASONS.NO_SUN }, night, config, now).changed,
    true,
  );
});

test('forecastPositions follows the hourly forecast', () => {
  const start = Date.parse('2026-07-15T08:00:00Z');
  const hourly = Array.from({ length: 14 }, (_, i) => ({
    time: start + i * 3600000,
    ...SUNNY,
    cloud_cover: i === 2 ? 100 : 10,
  }));
  const points = forecastPositions({
    facade,
    hourly,
    location: { latitude: 48.8566, longitude: 2.3522 },
    config,
    temperatureMax: 21,
  });
  assert.equal(points.length, 14);
  assert.equal(points[2].reason, REASONS.CLOUDY);
  assert.equal(points[4].reason, REASONS.GLARE, '12:00 UTC, sun in the south');
  assert.equal(points.at(-1).reason, REASONS.NIGHT, '21:00 UTC, after dusk');
});
