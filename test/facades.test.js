// -----------------------------------------------------------------------------
// Façades: fields of the actions, devices published to Gladys.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import {
  FACADE_DEFAULTS,
  FACADE_FEATURE,
  FacadeError,
  SUN_FEATURE,
  buildDiscoveredDevices,
  facadeAzimuth,
  facadeFromFields,
  facadeIds,
  findFacade,
} from '../src/facades.js';

test('a façade from the "Add a façade" fields, with the defaults', () => {
  const facade = facadeFromFields({ name: '  Bedrooms ', orientation: 'west' });
  assert.match(facade.id, /^[0-9a-f-]{36}$/);
  assert.equal(facade.name, 'Bedrooms');
  assert.equal(facadeAzimuth(facade), 270);
  assert.equal(facade.shade_position, FACADE_DEFAULTS.shade_position);
});

test('an exact azimuth wins over the orientation', () => {
  const facade = facadeFromFields({ name: 'Bay', orientation: 'south', azimuth: '195' });
  assert.equal(facadeAzimuth(facade), 195);
});

test('editing keeps the id and the blank fields, a new orientation drops the azimuth', () => {
  const current = facadeFromFields({
    name: 'Bay',
    orientation: 'south',
    azimuth: 195,
    heat_position: 5,
  });
  const renamed = facadeFromFields({ name: 'Big bay', heat_position: '' }, current);
  assert.equal(renamed.id, current.id);
  assert.equal(renamed.name, 'Big bay');
  assert.equal(renamed.heat_position, 5);
  assert.equal(facadeAzimuth(renamed), 195);
  assert.equal(facadeAzimuth(facadeFromFields({ orientation: 'east' }, current)), 90);
});

test('a façade needs a name and coherent sun heights', () => {
  assert.throws(() => facadeFromFields({ name: ' ' }), FacadeError);
  assert.throws(
    () => facadeFromFields({ name: 'X', min_elevation: 40, max_elevation: 30 }),
    FacadeError,
  );
});

test('the devices pass the Gladys checks, with stable external ids', async () => {
  const gladys = createFakeGladys();
  const facade = facadeFromFields({ name: 'Living room', orientation: 'south' });
  const devices = buildDiscoveredDevices(gladys, [facade]);
  await gladys.publishDiscoveredDevices(devices); // the fake refuses what Gladys refuses
  assert.equal(devices.length, 2);
  const [sun, device] = devices;
  assert.equal(sun.external_id, 'ext:test-integration:sun:local');
  assert.equal(device.external_id, `ext:test-integration:facade:${facade.id}`);
  assert.deepEqual(
    sun.features.map((f) => f.external_id.split(':').at(-1)),
    Object.values(SUN_FEATURE),
  );
  assert.deepEqual(
    device.features.map((f) => f.external_id.split(':').at(-1)),
    Object.values(FACADE_FEATURE),
  );
  for (const feature of devices.flatMap((d) => d.features)) {
    assert.ok(
      Number.isFinite(feature.min) && Number.isFinite(feature.max),
      `${feature.name}: min and max`,
    );
  }
  const controllable = devices.flatMap((d) => d.features).filter((f) => !f.read_only);
  assert.deepEqual(
    controllable.map((f) => f.external_id),
    [facadeIds(gladys, facade).feature('automation')],
  );
  assert.equal(findFacade(gladys, [facade], device.external_id), facade);
  assert.equal(findFacade(gladys, [facade], sun.external_id), null);
});
