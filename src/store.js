// -----------------------------------------------------------------------------
// Local state, persisted under /data (the only writable volume of the
// container):
//   - the façades the user declared (a flat config form cannot hold a list);
//   - per façade, the last position sent, why, when, and the pause of the
//     automation — so a restart neither re-fires the triggers nor forgets a
//     pause;
//   - the wind protection state and the day whose heat forecast was already
//     announced, for the same reason.
//
// No secret here: the integration has none (Open-Meteo needs no key).
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'store' });

export const DEFAULT_DATA_DIR = '/data';
const FILE_NAME = 'smart-shutters-state.json';

export const EMPTY_STATE = {
  facades: [],
  // facade id -> { position, reason, changed_at, shading, sun_on_facade,
  //                automation, paused_until }
  runtime: {},
  wind_active: false,
  // Local date (YYYY-MM-DD) whose heat forecast fired the trigger.
  heat_day_announced: null,
};

export function createStore({
  dir = process.env.SMART_SHUTTERS_DATA_DIR || DEFAULT_DATA_DIR,
} = {}) {
  const file = path.join(dir, FILE_NAME);
  let state = structuredClone(EMPTY_STATE);

  return {
    get state() {
      return state;
    },

    async load() {
      try {
        state = { ...structuredClone(EMPTY_STATE), ...JSON.parse(await readFile(file, 'utf8')) };
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger.warn(`Could not read ${file}, starting from a clean state: ${err.message}`);
        }
        state = structuredClone(EMPTY_STATE);
      }
      return state;
    },

    /** Merge and persist; a write failure is logged, the memory copy kept. */
    async update(patch) {
      state = { ...state, ...patch };
      try {
        await mkdir(dir, { recursive: true });
        // Write then rename: a crash never leaves a half-written file.
        const tmp = `${file}.tmp`;
        await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`);
        await rename(tmp, file);
      } catch (err) {
        logger.warn(`Could not write ${file}: ${err.message}`);
      }
      return state;
    },
  };
}
