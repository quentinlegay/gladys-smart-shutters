// -----------------------------------------------------------------------------
// Solar geometry against reference values (NOAA solar calculator).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  angleDifference,
  clearSkyRadiation,
  facadeIrradiance,
  incidenceAngle,
  nextSunEvents,
  sunPosition,
  sunReachesFacade,
} from '../src/solar.js';

const PARIS = [48.8566, 2.3522];
const near = (actual, expected, tolerance, message) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: ${actual} not within ${tolerance} of ${expected}`,
  );

test('the sun at the summer solstice in Paris', () => {
  const noon = sunPosition(new Date('2024-06-21T11:58:00Z'), ...PARIS);
  near(noon.elevation, 64.6, 0.3, 'elevation at solar noon');
  near(noon.azimuth, 180, 5, 'azimuth at solar noon');

  const morning = sunPosition(new Date('2024-06-21T06:00:00Z'), ...PARIS);
  near(morning.elevation, 19, 0.5, 'morning elevation');
  near(morning.azimuth, 75.7, 1, 'morning azimuth (east-north-east)');

  const evening = sunPosition(new Date('2024-06-21T18:00:00Z'), ...PARIS);
  near(evening.azimuth, 287.5, 1, 'evening azimuth (west-north-west)');
});

test('the sun at the winter solstice is low, and below the horizon at night', () => {
  near(sunPosition(new Date('2024-12-21T12:00:00Z'), ...PARIS).elevation, 17.7, 0.3, 'winter noon');
  assert.ok(sunPosition(new Date('2024-12-21T23:00:00Z'), ...PARIS).elevation < -40);
});

test('the southern hemisphere sees the noon sun in the north', () => {
  const sydney = sunPosition(new Date('2024-06-21T02:00:00Z'), -33.87, 151.21);
  assert.ok(sydney.elevation > 25 && sydney.elevation < 40);
  assert.ok(sydney.azimuth < 20 || sydney.azimuth > 340, `azimuth ${sydney.azimuth}`);
});

test('sunrise and sunset in Paris on the summer solstice', () => {
  const { sunrise, sunset } = nextSunEvents(Date.parse('2024-06-21T00:00:00Z'), ...PARIS);
  near(sunrise, Date.parse('2024-06-21T03:47:00Z'), 6 * 60000, 'sunrise');
  near(sunset, Date.parse('2024-06-21T19:58:00Z'), 6 * 60000, 'sunset');
});

test('no sunset during the polar day', () => {
  const { sunrise, sunset } = nextSunEvents(Date.parse('2024-06-21T00:00:00Z'), 78.2, 15.6);
  assert.equal(sunrise, null);
  assert.equal(sunset, null);
});

test('angle differences wrap around the north', () => {
  assert.equal(angleDifference(10, 350), 20);
  assert.equal(angleDifference(350, 10), -20);
  assert.equal(angleDifference(180, 0), 180);
});

const SOUTH = { azimuth: 180, opening_angle: 80, min_elevation: 5, max_elevation: 90 };

test('the sun reaches a façade within its opening angle and sun heights', () => {
  assert.ok(sunReachesFacade({ elevation: 40, azimuth: 200 }, SOUTH));
  assert.ok(!sunReachesFacade({ elevation: 40, azimuth: 90 }, SOUTH), 'east sun on a south façade');
  assert.ok(!sunReachesFacade({ elevation: 3, azimuth: 180 }, SOUTH), 'hidden by obstacles');
  assert.ok(
    !sunReachesFacade({ elevation: 60, azimuth: 180 }, { ...SOUTH, max_elevation: 50 }),
    'overhang',
  );
});

test('the direct beam only counts when the sun faces the façade', () => {
  const radiation = { ghi: 800, dni: 800, dhi: 100 };
  const facing = facadeIrradiance({ elevation: 20, azimuth: 180 }, SOUTH, radiation);
  const behind = facadeIrradiance({ elevation: 20, azimuth: 0 }, SOUTH, radiation);
  assert.ok(facing > 700, `facing ${facing}`);
  assert.equal(behind, 50 + 80, 'diffuse and reflected light only');
  assert.equal(facadeIrradiance({ elevation: -2, azimuth: 180 }, SOUTH, radiation), 0);
  assert.equal(Math.round(incidenceAngle({ elevation: 0, azimuth: 180 }, 180)), 0);
});

test('the clear-sky model grows with the sun height', () => {
  assert.deepEqual(clearSkyRadiation(-1), { ghi: 0, dni: 0, dhi: 0 });
  const low = clearSkyRadiation(10);
  const high = clearSkyRadiation(60);
  assert.ok(high.ghi > low.ghi && high.dni > low.dni);
  assert.ok(high.ghi > 700 && high.ghi < 1100, `high ${high.ghi}`);
});
