// -----------------------------------------------------------------------------
// The whole integration: lifecycle, façades, triggers, anti-flapping, wind,
// fallbacks, pause, restart — against the SDK's fake Gladys and a fake
// Open-Meteo.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NO_LOCATION } from '../src/i18n.js';
import { STALE_WEATHER_MS } from '../src/controller.js';
import { SOUTH_FACADE, setup } from './helpers/setup.js';
import { NOW, PARIS_HOUSE } from './helpers/fakeOpenMeteo.js';

const MINUTE = 60000;
const eventsOf = (gladys, key) => gladys.fake.sceneEvents.filter((event) => event.key === key);
const refresh = (ctx) => ctx.controller.refresh({ reason: 'test' });

test('connecting publishes the sun device, reads the weather and reports connected', async (t) => {
  const { gladys, meteo } = await setup(t);
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => device.name),
    ['Sun & weather'],
  );
  assert.equal(meteo.requests.length, 1);
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
  assert.equal(gladys.fake.lastState('ext:test-integration:sun:local:temperature'), 22);
});

test('without a located house the integration says so and reads nothing', async (t) => {
  const { gladys, meteo } = await setup(t, {
    houses: [{ ...PARIS_HOUSE, latitude: null, longitude: null }],
  });
  assert.equal(meteo.requests.length, 0);
  assert.deepEqual(gladys.fake.connectionStatus, { connected: false, message: NO_LOCATION });
});

test('the chosen house wins over the first one', async (t) => {
  const far = { id: 'h2', name: 'Chalet', selector: 'chalet', latitude: 45.92, longitude: 6.87 };
  const { ctx, meteo } = await setup(t, {
    config: { house: 'chalet' },
    houses: [PARIS_HOUSE, far],
  });
  assert.equal(ctx.controller.location.name, 'Chalet');
  assert.match(meteo.requests[0], /latitude=45\.9200/);
});

test('adding a façade publishes its device and fires its first position once', async (t) => {
  const { gladys, ctx, facadeDevice } = await setup(t, { facades: [SOUTH_FACADE] });
  assert.equal(gladys.fake.discoveredDevices.length, 2);
  const device = facadeDevice();
  assert.equal(device.name, 'Living room');
  const [event] = eventsOf(gladys, 'position_changed');
  assert.equal(event.data.facade, device.external_id);
  assert.equal(event.data.position, 30);
  assert.equal(event.data.reason, 'glare');
  assert.equal(event.data.previous_position, null);
  assert.equal(gladys.fake.lastState(`${device.external_id}:position`), 30);
  assert.equal(gladys.fake.lastState(`${device.external_id}:automation`), 1);

  await refresh(ctx);
  assert.equal(eventsOf(gladys, 'position_changed').length, 1, 'no change, no event');
});

test('a passing cloud does not move the shutters before the anti-flapping delay', async (t) => {
  const { gladys, ctx, meteo, clock } = await setup(t, { facades: [SOUTH_FACADE] });
  meteo.weather = { ...meteo.weather, cloud_cover: 100 };
  clock.now += 5 * MINUTE;
  await refresh(ctx);
  assert.equal(eventsOf(gladys, 'position_changed').length, 1, 'too early');

  clock.now += 20 * MINUTE;
  await refresh(ctx);
  const events = eventsOf(gladys, 'position_changed');
  assert.equal(events.length, 2);
  assert.equal(events[1].data.position, 100);
  assert.equal(events[1].data.reason, 'cloudy');
  assert.equal(events[1].data.previous_position, 30);
});

test('strong gusts move every façade at once, and the end is announced', async (t) => {
  const { gladys, ctx, meteo, clock } = await setup(t, { facades: [SOUTH_FACADE] });
  meteo.weather = { ...meteo.weather, wind_gusts: 70, wind_speed: 40 };
  clock.now += MINUTE;
  await refresh(ctx);
  const [started] = eventsOf(gladys, 'wind_protection');
  assert.deepEqual(started.data, {
    phase: 'started',
    wind_gusts: 70,
    wind_speed: 40,
    position: 100,
  });
  const moved = eventsOf(gladys, 'position_changed').at(-1);
  assert.equal(moved.data.reason, 'wind');
  assert.equal(moved.data.position, 100);

  meteo.weather = { ...meteo.weather, wind_gusts: 45 };
  clock.now += MINUTE;
  await refresh(ctx);
  assert.equal(eventsOf(gladys, 'wind_protection').length, 1, 'hysteresis: still protecting');

  meteo.weather = { ...meteo.weather, wind_gusts: 20, wind_speed: 10 };
  clock.now += MINUTE;
  await refresh(ctx);
  assert.equal(eventsOf(gladys, 'wind_protection').at(-1).data.phase, 'ended');
  assert.equal(eventsOf(gladys, 'position_changed').at(-1).data.reason, 'glare', 'back at once');
});

test('the sun leaving a façade is announced', async (t) => {
  const { gladys, ctx, clock } = await setup(t, {
    facades: [{ name: 'East', orientation: 'east' }],
  });
  // 12:00 UTC: the sun is in the south, beyond the 80° opening of an east façade.
  assert.equal(eventsOf(gladys, 'sun_on_facade').length, 0, 'no event without a previous state');
  clock.now = Date.parse('2026-07-15T06:00:00Z');
  await refresh(ctx);
  const [arrived] = eventsOf(gladys, 'sun_on_facade');
  assert.equal(arrived.data.phase, 'arrived');
  assert.equal(arrived.data.facade_name, 'East');
  clock.now = NOW;
  await refresh(ctx);
  assert.equal(eventsOf(gladys, 'sun_on_facade').at(-1).data.phase, 'left');
});

test('a hot forecast is announced once a day, after sunrise', async (t) => {
  const { gladys, ctx, meteo, clock } = await setup(t, { connect: false });
  meteo.weather = { ...meteo.weather, temperature_max: 31 };
  await gladys.connect();
  assert.deepEqual(
    eventsOf(gladys, 'heat_day').map((e) => e.data),
    [{ temperature_max: 31, temperature: 22 }],
  );
  clock.now += 2 * 3600000;
  await refresh(ctx);
  assert.equal(eventsOf(gladys, 'heat_day').length, 1);
  clock.now += 24 * 3600000;
  await refresh(ctx);
  assert.equal(eventsOf(gladys, 'heat_day').length, 2, 'the next day again');
});

test('Open-Meteo unreachable: the last forecast, then a clear sky, and a degraded badge', async (t) => {
  const { gladys, ctx, meteo, clock, facadeDevice } = await setup(t, { facades: [SOUTH_FACADE] });
  meteo.failure = 'network';
  clock.now += 30 * MINUTE;
  await refresh(ctx);
  const badge = () =>
    gladys.fake.transports.findLast(
      (entry) => entry.device_external_id === facadeDevice().external_id,
    );
  assert.equal(ctx.controller.weatherSource, 'stale');
  assert.equal(badge().transport, 'cloud');
  assert.equal(badge().degraded, true);
  assert.match(badge().message.en, /last forecast/);

  clock.now += STALE_WEATHER_MS;
  await refresh(ctx);
  assert.equal(ctx.controller.weatherSource, 'clear_sky');
  assert.match(badge().message.en, /clear sky/);
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true }, 'still working');

  meteo.failure = null;
  clock.now += 10 * MINUTE;
  await refresh(ctx);
  assert.equal(badge().degraded, undefined);
});

test('the automation switch pauses a façade: nothing is announced until it resumes', async (t) => {
  const { gladys, ctx, meteo, clock, facadeDevice } = await setup(t, { facades: [SOUTH_FACADE] });
  const device = facadeDevice();
  const automation = device.features.find((f) => f.external_id.endsWith(':automation'));
  assert.deepEqual(await gladys.fake.setValue(device, automation, 0), { success: true });
  assert.equal(gladys.fake.lastState(automation.external_id), 0);

  meteo.weather = { ...meteo.weather, cloud_cover: 100 };
  clock.now += 30 * MINUTE;
  await refresh(ctx);
  assert.equal(eventsOf(gladys, 'position_changed').length, 1, 'paused');
  assert.equal(
    gladys.fake.lastState(`${device.external_id}:position`),
    100,
    'still shows the recommendation',
  );

  await gladys.fake.setValue(device, automation, 1);
  clock.now += MINUTE;
  await refresh(ctx);
  assert.equal(eventsOf(gladys, 'position_changed').at(-1).data.reason, 'cloudy');
});

test('a timed pause ends by itself', async (t) => {
  const { gladys, ctx, clock, facadeDevice } = await setup(t, { facades: [SOUTH_FACADE] });
  const facade = ctx.controller.facades[0];
  await ctx.controller.pause([facade], 60);
  assert.equal(ctx.controller.isAutomatic(facade), false);
  clock.now += 61 * MINUTE;
  await refresh(ctx);
  assert.equal(ctx.controller.isAutomatic(facade), true);
  assert.equal(gladys.fake.lastState(`${facadeDevice().external_id}:automation`), 1);
});

test('a restart neither re-announces the position nor forgets a pause', async (t) => {
  const first = await setup(t, { facades: [SOUTH_FACADE, { name: 'West', orientation: 'west' }] });
  await first.ctx.controller.pause([first.ctx.controller.facades[1]], 0);
  first.app.shutdown();

  const second = await setup(t, { dir: first.dir });
  assert.equal(second.ctx.controller.facades.length, 2);
  assert.equal(eventsOf(second.gladys, 'position_changed').length, 0);
  assert.equal(second.ctx.controller.isAutomatic(second.ctx.controller.facades[1]), false);
});

test('editing and removing a façade', async (t) => {
  const { gladys, ctx, facadeDevice } = await setup(t, { facades: [SOUTH_FACADE] });
  const device = facadeDevice();
  const edited = await gladys.fake.action('edit_facade', {
    facade: device.external_id,
    name: 'Lounge',
    heat_position: 0,
  });
  assert.match(edited.data.message.en, /"Lounge" updated/);
  assert.equal(facadeDevice().external_id, device.external_id, 'same device');
  assert.equal(facadeDevice().name, 'Lounge');

  const unknown = await gladys.fake.action('remove_facade', {
    facade: 'ext:test-integration:facade:nope',
  });
  assert.match(unknown.data.message.en, /Unknown façade/);
  await gladys.fake.action('remove_facade', { facade: device.external_id });
  assert.equal(gladys.fake.discoveredDevices.length, 1);
  assert.deepEqual(ctx.store.state.runtime, {});
});

test('an invalid façade is explained under the button', async (t) => {
  const { gladys } = await setup(t);
  const answer = await gladys.fake.action('add_facade', { name: '', orientation: 'south' });
  assert.equal(answer.success, true);
  assert.equal(answer.data.message.fr, 'Donnez un nom à la façade.');
});

test('"Refresh now" reports the sky and every façade', async (t) => {
  const { gladys } = await setup(t, { facades: [SOUTH_FACADE] });
  const { data } = await gladys.fake.action('refresh_now');
  assert.match(data.message.en, /^Home: sun at 63° height/);
  assert.match(data.message.fr, /Living room 30 % \(Anti-éblouissement\)/);
});

test('a device created in Gladys gets its states again', async (t) => {
  const { gladys, facadeDevice } = await setup(t, { facades: [SOUTH_FACADE] });
  const before = gladys.fake.states.length;
  await gladys.fake.deviceCreated(facadeDevice());
  assert.ok(gladys.fake.states.length > before);
});

test('a config update is applied at once', async (t) => {
  const { gladys, ctx, facadeDevice } = await setup(t, { facades: [SOUTH_FACADE] });
  await gladys.fake.configUpdated({ glare_protection: false, refresh_interval: 30 });
  assert.equal(ctx.getConfig().refresh_interval, 30);
  assert.equal(
    gladys.fake.lastState(`${facadeDevice().external_id}:position`),
    30,
    'anti-flapping still holds',
  );
  assert.equal(ctx.controller.decisions[ctx.controller.facades[0].id].reason, 'solar_gain');
});

test('the shutdown stops the timer', async (t) => {
  const { app, ctx } = await setup(t);
  assert.ok(ctx.controller.timer);
  app.shutdown();
  assert.equal(ctx.controller.timer, null);
});

test('offline, the wind protection stays as it was', async (t) => {
  const { gladys, ctx, meteo, clock } = await setup(t, { facades: [SOUTH_FACADE] });
  meteo.weather = { ...meteo.weather, wind_gusts: 80 };
  clock.now += MINUTE;
  await refresh(ctx);
  meteo.failure = 'network';
  clock.now += STALE_WEATHER_MS + MINUTE;
  await refresh(ctx);
  assert.equal(ctx.controller.weatherSource, 'clear_sky');
  assert.equal(ctx.store.state.wind_active, true);
  assert.equal(eventsOf(gladys, 'wind_protection').length, 1, 'no "ended" without gusts');
});
