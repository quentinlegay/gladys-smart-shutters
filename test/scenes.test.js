// -----------------------------------------------------------------------------
// Scene triggers and actions against their manifest declarations: the event
// `data` carries exactly the declared fields and variables, the actions return
// exactly the declared outputs, and no action fires a trigger.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SOUTH_FACADE, setup } from './helpers/setup.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const declaredKeys = (key) => {
  const trigger = manifest.scene_triggers.find((entry) => entry.key === key);
  return new Set(
    [...(trigger.fields ?? []), ...(trigger.variables ?? [])].map((entry) => entry.key),
  );
};
const outputKeys = (key) =>
  manifest.scene_actions
    .find((entry) => entry.key === key)
    .outputs.map((output) => output.key)
    .sort();

const MINUTE = 60000;

/** Fire every trigger at least once. */
async function fireEverything(t) {
  const env = await setup(t, { connect: false });
  env.meteo.weather = { ...env.meteo.weather, temperature_max: 30 };
  await env.gladys.connect();
  await env.gladys.fake.action('add_facade', { name: 'East', orientation: 'east' });
  await env.gladys.fake.action('add_facade', SOUTH_FACADE);
  env.clock.now -= 6 * 3600000; // 06:00 UTC, the morning sun on the east façade
  await env.ctx.controller.refresh();
  env.meteo.weather = { ...env.meteo.weather, wind_gusts: 80 };
  env.clock.now += 6 * 3600000;
  await env.ctx.controller.refresh();
  return env;
}

test('every trigger fires with exactly its declared keys', async (t) => {
  const { gladys } = await fireEverything(t);
  const fired = new Set(gladys.fake.sceneEvents.map((event) => event.key));
  assert.deepEqual([...fired].sort(), manifest.scene_triggers.map((entry) => entry.key).sort());
  for (const { key, data } of gladys.fake.sceneEvents) {
    assert.deepEqual(Object.keys(data).sort(), [...declaredKeys(key)].sort(), key);
    for (const [name, value] of Object.entries(data)) {
      assert.ok(
        value === null || ['string', 'number', 'boolean'].includes(typeof value),
        `${key}.${name}`,
      );
    }
  }
});

test('the select values of the events are the declared options', async (t) => {
  const { gladys } = await fireEverything(t);
  for (const { key, data } of gladys.fake.sceneEvents) {
    const trigger = manifest.scene_triggers.find((entry) => entry.key === key);
    for (const field of trigger.fields ?? []) {
      if (field.options && data[field.key] !== null) {
        assert.ok(
          field.options.some((option) => option.value === data[field.key]),
          `${key}.${field.key} = ${data[field.key]}`,
        );
      }
    }
  }
});

test('get_recommendation returns its declared outputs', async (t) => {
  const { gladys, facadeDevice } = await setup(t, { facades: [SOUTH_FACADE] });
  const { success, data } = await gladys.fake.sceneAction('get_recommendation', {
    facade: facadeDevice().external_id,
  });
  assert.equal(success, true);
  assert.deepEqual(Object.keys(data.outputs).sort(), outputKeys('get_recommendation'));
  assert.deepEqual(data.outputs, {
    position: 30,
    reason: 'glare',
    reason_label: 'Glare protection',
    sun_on_facade: true,
    irradiance: data.outputs.irradiance,
    automation: true,
  });
});

test('an unknown façade fails the action only', async (t) => {
  const { gladys } = await setup(t, { facades: [SOUTH_FACADE] });
  const answer = await gladys.fake.sceneAction('get_recommendation', {
    facade: 'ext:test-integration:sun:local',
  });
  assert.equal(answer.success, false);
});

test('pause and resume every façade, without firing any trigger', async (t) => {
  const { gladys, ctx, clock, meteo } = await setup(t, {
    facades: [SOUTH_FACADE, { name: 'West', orientation: 'west' }],
  });
  const positions = () =>
    gladys.fake.sceneEvents.filter((event) => event.key === 'position_changed').length;
  const before = positions();

  const paused = await gladys.fake.sceneAction('pause_automation', { duration: 90 });
  assert.deepEqual(Object.keys(paused.data.outputs).sort(), outputKeys('pause_automation'));
  assert.equal(paused.data.outputs.paused_count, 2);
  assert.equal(paused.data.outputs.resume_at, new Date(clock.now + 90 * MINUTE).toISOString());

  meteo.weather = { ...meteo.weather, cloud_cover: 100 };
  clock.now += 30 * MINUTE;
  await ctx.controller.refresh();
  assert.equal(positions(), before, 'paused façades announce no position');

  const forever = await gladys.fake.sceneAction('pause_automation', { duration: 0 });
  assert.equal(forever.data.outputs.resume_at, '');

  const resumed = await gladys.fake.sceneAction('resume_automation', {});
  assert.deepEqual(Object.keys(resumed.data.outputs).sort(), outputKeys('resume_automation'));
  assert.deepEqual(resumed.data.outputs, { resumed_count: 2, position: null });
  const events = gladys.fake.sceneEvents.length;
  await gladys.fake.sceneAction('pause_automation', { duration: 10 });
  await gladys.fake.sceneAction('resume_automation', {});
  assert.equal(gladys.fake.sceneEvents.length, events, 'no trigger fired by an action');
});

test('resuming one façade returns its recommendation', async (t) => {
  const { gladys, facadeDevice } = await setup(t, { facades: [SOUTH_FACADE] });
  const facade = facadeDevice().external_id;
  await gladys.fake.sceneAction('pause_automation', { facade, duration: 0 });
  const { data } = await gladys.fake.sceneAction('resume_automation', { facade });
  assert.deepEqual(data.outputs, { resumed_count: 1, position: 30 });
});
