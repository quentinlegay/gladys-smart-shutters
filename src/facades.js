// -----------------------------------------------------------------------------
// Façades and Gladys devices.
//
// A façade is a group of windows facing the same direction, with the same
// obstacles and the same shutter settings: "Living room south", "Bedrooms
// west". The user declares them with the "Add a façade" action; they live in
// /data (src/store.js).
//
// Devices published to Gladys:
//   - one "Sun & weather" device: sun elevation and azimuth, cloud cover,
//     temperature, gusts, UV index, global irradiance;
//   - one device per façade: the recommended position (a read-only shutter
//     position), the automation switch, whether the sun reaches it, the power
//     it receives, and the reason of the recommendation.
//
// External ids are forever: a façade is keyed by the random id drawn when it
// was added (renaming it keeps its device), and the feature keys below are
// never renamed — Gladys keys the history, the scenes and the dashboards on
// them.
// -----------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import { toBoundedNumber } from './config.js';

export const MAX_FACADES = 12;

export const ORIENTATIONS = {
  north: 0,
  north_east: 45,
  east: 90,
  south_east: 135,
  south: 180,
  south_west: 225,
  west: 270,
  north_west: 315,
};

export const FACADE_DEFAULTS = {
  orientation: 'south',
  opening_angle: 80,
  min_elevation: 5,
  max_elevation: 90,
  shade_position: 30,
  heat_position: 10,
};

export const FACADE_LIMITS = {
  azimuth: [0, 359],
  opening_angle: [10, 90],
  min_elevation: [0, 60],
  max_elevation: [10, 90],
  shade_position: [0, 100],
  heat_position: [0, 100],
};

export const SUN_DEVICE_TYPE = 'sun';
// The sun device is unique per integration: no platform id to derive it from.
const SUN_PLATFORM_ID = 'local';
export const FACADE_DEVICE_TYPE = 'facade';

export const SUN_FEATURE = {
  ELEVATION: 'elevation',
  AZIMUTH: 'azimuth',
  IRRADIANCE: 'irradiance',
  CLOUD_COVER: 'cloud_cover',
  TEMPERATURE: 'temperature',
  WIND_GUSTS: 'wind_gusts',
  UV_INDEX: 'uv_index',
};

export const FACADE_FEATURE = {
  POSITION: 'position',
  AUTOMATION: 'automation',
  SUN_ON_FACADE: 'sun_on_facade',
  IRRADIANCE: 'irradiance',
  REASON: 'reason',
};

export class FacadeError extends Error {
  /** @param {Record<string, string>} userMessage - multi-language message */
  constructor(userMessage) {
    super(userMessage.en);
    this.name = 'FacadeError';
    this.userMessage = userMessage;
  }
}

const isBlank = (value) => value === undefined || value === null || value === '';

/**
 * Build a façade from the fields of the "Add a façade" / "Edit a façade"
 * actions. Blank fields keep the current value (edit) or the default (add).
 * @param {Record<string, unknown>} fields
 * @param {object} [current] - the façade being edited
 */
export function facadeFromFields(fields, current) {
  const base = current ?? { id: randomUUID(), name: '', azimuth: null, ...FACADE_DEFAULTS };
  const name = isBlank(fields.name) ? base.name : String(fields.name).trim().slice(0, 60);
  if (!name) {
    throw new FacadeError({
      en: 'Give the façade a name.',
      fr: 'Donnez un nom à la façade.',
      de: 'Geben Sie der Fassade einen Namen.',
      es: 'Ponle un nombre a la fachada.',
    });
  }
  const orientation =
    typeof fields.orientation === 'string' && fields.orientation in ORIENTATIONS
      ? fields.orientation
      : base.orientation;
  // An exact azimuth wins over the compass point; choosing a new compass
  // point without an azimuth drops the previous exact one.
  let azimuth = base.azimuth;
  if (!isBlank(fields.azimuth)) {
    azimuth = toBoundedNumber(fields.azimuth, FACADE_LIMITS.azimuth, null);
  } else if (orientation !== base.orientation) {
    azimuth = null;
  }
  const number = (key) => toBoundedNumber(fields[key], FACADE_LIMITS[key], base[key]);
  const facade = {
    id: base.id,
    name,
    orientation,
    azimuth,
    opening_angle: number('opening_angle'),
    min_elevation: number('min_elevation'),
    max_elevation: number('max_elevation'),
    shade_position: number('shade_position'),
    heat_position: number('heat_position'),
  };
  if (facade.max_elevation <= facade.min_elevation) {
    throw new FacadeError({
      en: 'The maximum sun height must be above the minimum one.',
      fr: 'La hauteur maximale du soleil doit dépasser la hauteur minimale.',
      de: 'Die maximale Sonnenhöhe muss über der minimalen liegen.',
      es: 'La altura máxima del sol debe superar la mínima.',
    });
  }
  return facade;
}

/** The façade's outward direction, in compass degrees. */
export const facadeAzimuth = (facade) => facade.azimuth ?? ORIENTATIONS[facade.orientation] ?? 180;

/** The geometry the engine and solar.js work with. */
export const facadeGeometry = (facade) => ({ ...facade, azimuth: facadeAzimuth(facade) });

export const sunIds = (gladys) => gladys.externalIds(SUN_DEVICE_TYPE, SUN_PLATFORM_ID);
export const facadeIds = (gladys, facade) => gladys.externalIds(FACADE_DEVICE_TYPE, facade.id);

/** The façade a Gladys device external id (a select value) designates. */
export function findFacade(gladys, facades, deviceExternalId) {
  return facades.find((facade) => facadeIds(gladys, facade).device === deviceExternalId) ?? null;
}

const feature = (ids, key, name, category, type, extra) => ({
  name,
  external_id: ids.feature(key),
  category,
  type,
  read_only: true,
  has_feedback: false,
  keep_history: true,
  ...extra,
});

function buildSunDevice(gladys) {
  const ids = sunIds(gladys);
  const angle = (key, name, min, max) =>
    feature(ids, key, name, CATEGORIES.ANGLE_SENSOR, TYPES.SENSOR.DECIMAL, {
      unit: UNITS.DEGREE,
      min,
      max,
    });
  return {
    name: 'Sun & weather',
    external_id: ids.device,
    // No `should_poll`: the integration refreshes on its own timer, in
    // minutes, slower than the slowest Gladys poll.
    features: [
      angle(SUN_FEATURE.ELEVATION, 'Sun elevation', -90, 90),
      angle(SUN_FEATURE.AZIMUTH, 'Sun azimuth', 0, 360),
      feature(
        ids,
        SUN_FEATURE.IRRADIANCE,
        'Global irradiance (W/m²)',
        CATEGORIES.LIGHT_SENSOR,
        TYPES.SENSOR.DECIMAL,
        {
          min: 0,
          max: 1500,
        },
      ),
      feature(
        ids,
        SUN_FEATURE.CLOUD_COVER,
        'Cloud cover',
        CATEGORIES.UNKNOWN,
        TYPES.SENSOR.INTEGER,
        {
          unit: UNITS.PERCENT,
          min: 0,
          max: 100,
        },
      ),
      feature(
        ids,
        SUN_FEATURE.TEMPERATURE,
        'Outdoor temperature',
        CATEGORIES.TEMPERATURE_SENSOR,
        TYPES.SENSOR.DECIMAL,
        {
          unit: UNITS.CELSIUS,
          min: -60,
          max: 60,
        },
      ),
      feature(
        ids,
        SUN_FEATURE.WIND_GUSTS,
        'Wind gusts',
        CATEGORIES.SPEED_SENSOR,
        TYPES.SPEED_SENSOR.DECIMAL,
        {
          unit: UNITS.KILOMETER_PER_HOUR,
          min: 0,
          max: 400,
        },
      ),
      feature(
        ids,
        SUN_FEATURE.UV_INDEX,
        'UV index',
        CATEGORIES.UV_SENSOR,
        TYPES.UV_SENSOR.INTEGER,
        {
          unit: UNITS.UV_INDEX,
          min: 0,
          max: 20,
        },
      ),
    ],
  };
}

function buildFacadeDevice(gladys, facade) {
  const ids = facadeIds(gladys, facade);
  return {
    name: facade.name,
    external_id: ids.device,
    features: [
      feature(
        ids,
        FACADE_FEATURE.POSITION,
        'Recommended position',
        CATEGORIES.SHUTTER,
        TYPES.SHUTTER.POSITION,
        {
          unit: UNITS.PERCENT,
          min: 0,
          max: 100,
        },
      ),
      feature(
        ids,
        FACADE_FEATURE.AUTOMATION,
        'Automation',
        CATEGORIES.SWITCH,
        TYPES.SWITCH.BINARY,
        {
          // The one command of the device: pause (0) or resume (1) the
          // automation of this façade.
          read_only: false,
          has_feedback: true,
          min: 0,
          max: 1,
        },
      ),
      feature(
        ids,
        FACADE_FEATURE.SUN_ON_FACADE,
        'Sun on the façade',
        CATEGORIES.LIGHT_SENSOR,
        TYPES.SENSOR.BINARY,
        {
          min: 0,
          max: 1,
        },
      ),
      feature(
        ids,
        FACADE_FEATURE.IRRADIANCE,
        'Irradiance on the façade (W/m²)',
        CATEGORIES.LIGHT_SENSOR,
        TYPES.SENSOR.DECIMAL,
        {
          min: 0,
          max: 1500,
        },
      ),
      feature(ids, FACADE_FEATURE.REASON, 'Reason', CATEGORIES.TEXT, TYPES.TEXT.TEXT, {
        // Gladys requires min and max on every feature, text included: they
        // bound the length of the text.
        min: 0,
        max: 255,
        keep_history: false,
      }),
    ],
  };
}

/** Discovery payload: the sun device, then one device per façade. */
export function buildDiscoveredDevices(gladys, facades) {
  return [buildSunDevice(gladys), ...facades.map((facade) => buildFacadeDevice(gladys, facade))];
}
