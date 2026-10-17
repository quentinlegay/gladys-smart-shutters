// -----------------------------------------------------------------------------
// The whole integration against the SDK's fake Gladys and the fake Open-Meteo
// API, with its /data state in a temporary directory.
// -----------------------------------------------------------------------------

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../../src/app.js';
import { createStore } from '../../src/store.js';
import { NOW, PARIS_HOUSE, createFakeOpenMeteo } from './fakeOpenMeteo.js';

export const SOUTH_FACADE = { name: 'Living room', orientation: 'south' };

/**
 * @param {import('node:test').TestContext} t
 * @param {object} [options]
 * @param {object} [options.config] - Gladys config.
 * @param {Array} [options.houses] - Gladys houses.
 * @param {Array<object>} [options.facades] - fields of the façades to add.
 * @param {boolean} [options.connect] - Connect right away (default true).
 * @param {string} [options.dir] - reuse a /data directory (a restart).
 */
export async function setup(
  t,
  {
    config = {},
    houses = [PARIS_HOUSE],
    facades = [],
    connect = true,
    dir,
    clock = { now: NOW },
  } = {},
) {
  const dataDir = dir ?? (await mkdtemp(path.join(tmpdir(), 'gladys-smart-shutters-')));
  const meteo = createFakeOpenMeteo({ now: () => clock.now });
  const gladys = createFakeGladys({ config, houses });
  const app = createApp(gladys, {
    fetch: meteo.fetch,
    now: () => clock.now,
    store: createStore({ dir: dataDir }),
  });
  t.after(async () => {
    app.shutdown();
    if (!dir) {
      await rm(dataDir, { recursive: true, force: true });
    }
  });
  if (connect) {
    await gladys.connect();
    for (const fields of facades) {
      await gladys.fake.action('add_facade', fields);
    }
  }
  const facadeDevice = (index = 0) => gladys.fake.discoveredDevices[index + 1];
  return { gladys, meteo, app, ctx: app.ctx, clock, dir: dataDir, facadeDevice };
}
