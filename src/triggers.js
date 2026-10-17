// -----------------------------------------------------------------------------
// Scene triggers (manifest `scene_triggers`, Gladys 5.1+): what the
// integration announces. No handler to register: the controller fires them
// with `gladys.publishSceneEvent(key, data)` on a transition, never on every
// refresh.
//
// The event `data` is flat and only carries the keys the manifest declares as
// `fields` (the filters of the scene card) or `variables` (readable as
// {{triggerEvent.data.<key>}} by the following actions). test/scenes.test.js
// checks every event against its declaration.
// -----------------------------------------------------------------------------

export const TRIGGERS = {
  // The recommended position of a façade changed (automation on): bind it to
  // the "set the shutter position" action of the real shutters, with the
  // {{triggerEvent.data.position}} variable.
  POSITION_CHANGED: 'position_changed',
  // The sun started or stopped reaching a façade.
  SUN_ON_FACADE: 'sun_on_facade',
  // The wind protection started or ended.
  WIND_PROTECTION: 'wind_protection',
  // Today's forecast reaches the heat threshold (once per day).
  HEAT_DAY: 'heat_day',
};

export const TRIGGER_KEYS = Object.values(TRIGGERS);

export const SUN_PHASES = { ARRIVED: 'arrived', LEFT: 'left' };
export const WIND_PHASES = { STARTED: 'started', ENDED: 'ended' };

const round = (value, digits = 1) =>
  value == null ? null : Math.round(value * 10 ** digits) / 10 ** digits;

export function positionChangedData({
  facadeExternalId,
  facade,
  position,
  previousPosition,
  decision,
  sun,
}) {
  return {
    facade: facadeExternalId,
    reason: decision.reason,
    facade_name: facade.name,
    position,
    previous_position: previousPosition ?? null,
    irradiance: decision.irradiance,
    sun_elevation: round(sun.elevation),
  };
}

export function sunOnFacadeData({ facadeExternalId, facade, arrived, sun }) {
  return {
    facade: facadeExternalId,
    phase: arrived ? SUN_PHASES.ARRIVED : SUN_PHASES.LEFT,
    facade_name: facade.name,
    sun_elevation: round(sun.elevation),
    sun_azimuth: round(sun.azimuth),
  };
}

export function windProtectionData({ active, weather, config }) {
  return {
    phase: active ? WIND_PHASES.STARTED : WIND_PHASES.ENDED,
    wind_gusts: round(weather.wind_gusts),
    wind_speed: round(weather.wind_speed),
    position: active ? config.wind_position : null,
  };
}

export function heatDayData({ weather }) {
  return {
    temperature_max: round(weather.temperature_max),
    temperature: round(weather.temperature),
  };
}
