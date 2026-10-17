// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ACTIONS } from '../src/actions.js';
import { DEFAULT_CONFIG, LIMITS } from '../src/config.js';
import { REASONS } from '../src/engine.js';
import { FACADE_DEFAULTS, FACADE_LIMITS, ORIENTATIONS } from '../src/facades.js';
import { SCENE_ACTIONS } from '../src/scenes.js';
import { SUN_PHASES, TRIGGER_KEYS, WIND_PHASES } from '../src/triggers.js';
import { WIDGETS } from '../src/widgets.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// Every list of form fields the manifest can declare (same field grammar).
const allFields = [
  ...(manifest.config_schema ?? []),
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

const keysOf = (list) => (list ?? []).map((entry) => entry.key);
const optionsOf = (field) => field.options.map((option) => option.value);
const byKey = (list, key) => list.find((entry) => entry.key === key);

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

function isAtLeast(version, required) {
  for (let i = 0; i < required.length; i += 1) {
    if (version[i] !== required[i]) {
      return version[i] > required[i];
    }
  }
  return true;
}

test('every manifest action has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.actions).sort(), Object.keys(ACTIONS).sort());
});

test('every scene_actions key has an onSceneAction handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_actions).sort(), Object.keys(SCENE_ACTIONS).sort());
});

test('every widgets key has an onWidgetGet handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.widgets).sort(), Object.keys(WIDGETS).sort());
  for (const widget of manifest.widgets) {
    for (const text of Object.values(widget.label)) {
      assert.ok(text.length >= 3 && text.length <= 30, `widget ${widget.key} label "${text}"`);
    }
    for (const text of Object.values(widget.description ?? {})) {
      assert.ok(text.length <= 100, `widget ${widget.key} description`);
    }
  }
});

test('every scene trigger the code fires is declared in scene_triggers, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers).sort(), [...TRIGGER_KEYS].sort());
});

test('Open-Meteo is a cloud service: the cloud transport only, and the house location', () => {
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.equal(manifest.location, true);
  assert.equal(manifest.type, 'device');
});

test('the gladys_version minimum covers the declared fields', () => {
  const min = minGladysVersion();
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  assert.ok(isAtLeast(min, [4, 86, 0]), 'categories');
  for (const field of ['scene_triggers', 'scene_actions', 'widgets']) {
    assert.ok(manifest[field], `${field} is declared`);
  }
  assert.ok(isAtLeast(min, [5, 1, 0]), 'scene_triggers, scene_actions and widgets');
  assert.ok(allFields.some((field) => field.source === 'houses'));
  assert.ok(isAtLeast(min, [5, 2, 0]), 'source: "houses"');
});

test('the select options match the values the code understands', () => {
  const positionChanged = byKey(manifest.scene_triggers, 'position_changed');
  assert.deepEqual(
    optionsOf(byKey(positionChanged.fields, 'reason')).sort(),
    Object.values(REASONS).sort(),
  );
  assert.deepEqual(
    optionsOf(byKey(byKey(manifest.scene_triggers, 'sun_on_facade').fields, 'phase')).sort(),
    Object.values(SUN_PHASES).sort(),
  );
  assert.deepEqual(
    optionsOf(byKey(byKey(manifest.scene_triggers, 'wind_protection').fields, 'phase')).sort(),
    Object.values(WIND_PHASES).sort(),
  );
  for (const action of ['add_facade', 'edit_facade']) {
    const orientation = byKey(byKey(manifest.actions, action).fields, 'orientation');
    assert.deepEqual(optionsOf(orientation), Object.keys(ORIENTATIONS), action);
  }
});

test('config_schema defaults and bounds stay consistent with the code', () => {
  for (const field of manifest.config_schema) {
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, `DEFAULT_CONFIG.${field.key}`);
    }
    if (field.type === 'number') {
      assert.deepEqual([field.min, field.max], LIMITS[field.key], `LIMITS.${field.key}`);
    }
  }
  const formKeys = keysOf(manifest.config_schema.filter((field) => field.type !== 'section'));
  assert.deepEqual(formKeys.sort(), Object.keys(DEFAULT_CONFIG).sort());
});

test('the façade fields match the façade defaults and bounds', () => {
  const add = byKey(manifest.actions, 'add_facade').fields;
  const edit = byKey(manifest.actions, 'edit_facade').fields;
  for (const field of add) {
    if (field.default !== undefined) {
      assert.equal(FACADE_DEFAULTS[field.key], field.default, `FACADE_DEFAULTS.${field.key}`);
    }
    if (field.type === 'number') {
      assert.deepEqual(
        [field.min, field.max],
        FACADE_LIMITS[field.key],
        `FACADE_LIMITS.${field.key}`,
      );
    }
  }
  // Editing: the same fields after the façade select, none required, no
  // default (a blank field keeps the current value).
  assert.deepEqual(keysOf(edit), ['facade', ...keysOf(add)]);
  for (const field of edit.slice(1)) {
    assert.equal(field.required, undefined, `edit_facade.${field.key}`);
    assert.equal(field.default, undefined, `edit_facade.${field.key}`);
  }
});

test('section fields are purely presentational', () => {
  const sections = manifest.config_schema.filter((f) => f.type === 'section');
  assert.ok(sections.length > 0);
  for (const section of sections) {
    assert.equal(section.required, undefined, `section "${section.key}" must not be required`);
    assert.equal(section.default, undefined, `section "${section.key}" must not have a default`);
    assert.ok(!(section.key in DEFAULT_CONFIG));
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//, 'section links must be https');
    }
  }
});

test('dynamic selects carry no default', () => {
  for (const field of allFields.filter((f) => f.source)) {
    assert.equal(field.default, undefined, `${field.key}`);
    assert.equal(field.options, undefined, `${field.key}`);
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version, 'manifest version must match package.json');
  assert.ok(
    manifest.docker_image.endsWith(`:${manifest.version}`),
    `docker_image must be tagged :${manifest.version}, got "${manifest.docker_image}"`,
  );
});

test('the catalog description holds 10 to 100 characters per language', () => {
  assert.ok(manifest.description.en, 'the description needs an English text');
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(
      text.length >= 10 && text.length <= 100,
      `description.${lang} has ${text.length} characters (10 to 100 allowed)`,
    );
  }
});

test('every text exists in English, French, German and Spanish', () => {
  const texts = [];
  const walk = (node, where) => {
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${where}[${i}]`));
    } else if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        if (['label', 'description', 'placeholder'].includes(key)) {
          texts.push([`${where}.${key}`, value]);
        } else {
          walk(value, `${where}.${key}`);
        }
      }
    }
  };
  walk(manifest, 'manifest');
  assert.ok(texts.length > 100);
  for (const [where, text] of texts) {
    assert.equal(typeof text, 'object', `${where} must be a multi-language object`);
    for (const lang of ['en', 'fr', 'de', 'es']) {
      assert.ok(text[lang], `${where} needs a "${lang}" text`);
    }
  }
});

test('field placeholders are multi-language objects', () => {
  const withPlaceholder = allFields.filter((f) => f.placeholder !== undefined);
  assert.ok(withPlaceholder.length > 0);
  for (const field of withPlaceholder) {
    assert.equal(typeof field.placeholder, 'object', `field "${field.key}": placeholder`);
    assert.ok(field.placeholder.en, `field "${field.key}": placeholder needs an English text`);
  }
});
