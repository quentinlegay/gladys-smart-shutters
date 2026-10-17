import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig } from '../src/config.js';

test('an empty config gets the defaults', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
  assert.deepEqual(normalizeConfig({}), DEFAULT_CONFIG);
});

test('form strings become numbers and booleans', () => {
  const config = normalizeConfig({
    refresh_interval: '15',
    night_mode: 'false',
    anticipate_heat: 'true',
  });
  assert.equal(config.refresh_interval, 15);
  assert.equal(config.night_mode, false);
  assert.equal(config.anticipate_heat, true);
});

test('values out of bounds are clamped, invalid ones fall back to the default', () => {
  const config = normalizeConfig({
    refresh_interval: 1,
    wind_position: 150,
    heat_threshold: 'hot',
  });
  assert.equal(config.refresh_interval, 5, 'the 5-minute floor');
  assert.equal(config.wind_position, 100);
  assert.equal(config.heat_threshold, DEFAULT_CONFIG.heat_threshold);
});

test('the cold threshold stays under the heat threshold', () => {
  const config = normalizeConfig({ heat_threshold: 20, cold_threshold: 25 });
  assert.equal(config.cold_threshold, 19);
});

test('an unknown key never leaks into the config', () => {
  assert.equal(normalizeConfig({ something: 1 }).something, undefined);
});
