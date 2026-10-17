// -----------------------------------------------------------------------------
// Dashboard widgets: every content is rendered exactly as sent
// (`validateWidgetContent` → []), in every state; live tiles point at
// published features; every button is handled.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { WIDGET_KEYS } from '../src/widgets.js';
import { SOUTH_FACADE, setup } from './helpers/setup.js';
import { PARIS_HOUSE } from './helpers/fakeOpenMeteo.js';

async function contentOf(gladys, key, settings = {}, language = 'en') {
  const answer = await gladys.fake.widgetGet(key, { settings, language });
  assert.equal(answer.success, true, `${key}: ${answer.error}`);
  return answer.data.content;
}

async function assertAllValid(gladys, settings) {
  const contents = {};
  for (const key of Object.values(WIDGET_KEYS)) {
    contents[key] = await contentOf(gladys, key, settings);
    assert.deepEqual(validateWidgetContent(contents[key]), [], key);
  }
  return contents;
}

test('every widget is valid without a location, without a façade, and with one', async (t) => {
  const unlocated = await setup(t, { houses: [] });
  const empty = await assertAllValid(unlocated.gladys, {});
  assert.match(empty[WIDGET_KEYS.OVERVIEW].components[0].text.en, /house/);

  const noFacade = await setup(t);
  assert.match(
    (await assertAllValid(noFacade.gladys, {}))[WIDGET_KEYS.FACADE].components[0].text.en,
    /Add a façade/,
  );

  const { gladys, facadeDevice } = await setup(t, { facades: [SOUTH_FACADE] });
  const contents = await assertAllValid(gladys, { facade: facadeDevice().external_id });
  const facade = contents[WIDGET_KEYS.FACADE];
  assert.ok(
    facade.components.some((c) => c.type === 'chart'),
    'the 12-hour outlook',
  );
  assert.equal(facade.components.find((c) => c.type === 'button').action.key, 'pause');
});

test('the façade widget of an unknown façade explains it', async (t) => {
  const { gladys } = await setup(t, { facades: [SOUTH_FACADE] });
  const content = await contentOf(gladys, WIDGET_KEYS.FACADE, {
    facade: 'ext:test-integration:sun:local',
  });
  assert.deepEqual(validateWidgetContent(content), []);
  assert.match(content.components[0].text.en, /Unknown façade/);
});

test('paused, offline and crowded states stay valid', async (t) => {
  const { gladys, ctx, meteo, clock, facadeDevice } = await setup(t, {
    facades: Array.from({ length: 12 }, (_, i) => ({
      name: `Façade number ${i + 1}`,
      orientation: 'south',
    })),
  });
  await ctx.controller.pause(ctx.controller.facades.slice(0, 3), 60);
  meteo.failure = 'network';
  clock.now += 10 * 60000;
  await ctx.controller.refresh();
  const contents = await assertAllValid(gladys, { facade: facadeDevice().external_id });
  const overview = contents[WIDGET_KEYS.OVERVIEW];
  assert.equal(overview.components.find((c) => c.type === 'status').items.length, 10);
  assert.deepEqual(
    overview.components.filter((c) => c.type === 'button').map((c) => c.action.key),
    ['pause', 'resume'],
  );
  const facadeStatus = contents[WIDGET_KEYS.FACADE].components.find((c) => c.type === 'status');
  assert.ok(
    facadeStatus.items.some((item) => item.color === 'warning'),
    'paused and offline show a warning',
  );
});

test('live tiles reference features the integration publishes', async (t) => {
  const { gladys, facadeDevice } = await setup(t, { facades: [SOUTH_FACADE] });
  const featureIds = new Set(
    gladys.fake.discoveredDevices.flatMap((d) => d.features.map((f) => f.external_id)),
  );
  for (const key of Object.values(WIDGET_KEYS)) {
    const content = await contentOf(gladys, key, { facade: facadeDevice().external_id });
    for (const tile of content.components.filter((c) => c.device_feature)) {
      assert.ok(
        featureIds.has(tile.device_feature),
        `${key}: unknown feature ${tile.device_feature}`,
      );
    }
  }
});

test('the widget buttons pause and resume, and answer a toast', async (t) => {
  const { gladys, ctx, facadeDevice } = await setup(t, {
    facades: [SOUTH_FACADE, { name: 'West', orientation: 'west' }],
  });
  const settings = { facade: facadeDevice().external_id };
  const facadeContent = await contentOf(gladys, WIDGET_KEYS.FACADE, settings);
  const pause = facadeContent.components.find((c) => c.type === 'button').action;
  const answer = await gladys.fake.widgetAction(WIDGET_KEYS.FACADE, pause.key, pause.params, {
    settings,
  });
  assert.equal(answer.success, true);
  assert.match(answer.data.message.en, /paused for 2 h \(1 façade/);
  assert.equal(ctx.controller.isAutomatic(ctx.controller.facades[0]), false);
  assert.equal(ctx.controller.isAutomatic(ctx.controller.facades[1]), true);

  const overview = await contentOf(gladys, WIDGET_KEYS.OVERVIEW);
  const resume = overview.components.find(
    (c) => c.type === 'button' && c.action.key === 'resume',
  ).action;
  const resumed = await gladys.fake.widgetAction(
    WIDGET_KEYS.OVERVIEW,
    resume.key,
    resume.params ?? {},
  );
  assert.match(resumed.data.message.fr, /Automatisme repris \(2 façade/);
  assert.ok(ctx.controller.facades.every((facade) => ctx.controller.isAutomatic(facade)));

  const unknown = await gladys.fake.widgetAction(WIDGET_KEYS.OVERVIEW, 'dance', {});
  assert.equal(unknown.success, false);
});

test('the refreshes nudge the widgets', async (t) => {
  const { gladys } = await setup(t, { houses: [PARIS_HOUSE] });
  assert.deepEqual(
    [...new Set(gladys.fake.widgetRefreshes)].sort(),
    Object.values(WIDGET_KEYS).sort(),
  );
});
