// -----------------------------------------------------------------------------
// Solar geometry, pure functions: where the sun is, whether it shines on a
// façade, and how much power it brings there. Computed locally (NOAA solar
// position equations, after Jean Meeus) — no network, accurate to a fraction
// of a degree, far below what a shutter can tell apart.
//
// Conventions: angles in degrees; azimuths measured clockwise from the north
// (0 = N, 90 = E, 180 = S, 270 = W), like a compass; irradiances in W/m².
// -----------------------------------------------------------------------------

const RAD = Math.PI / 180;
const sin = (deg) => Math.sin(deg * RAD);
const cos = (deg) => Math.cos(deg * RAD);
const tan = (deg) => Math.tan(deg * RAD);

/** Bring an angle into [0, 360). */
export const normalizeAngle = (deg) => ((deg % 360) + 360) % 360;

/** Signed smallest difference a - b, in (-180, 180]. */
export function angleDifference(a, b) {
  const diff = normalizeAngle(a - b);
  return diff > 180 ? diff - 360 : diff;
}

/**
 * Position of the sun seen from a place at an instant.
 * @param {Date|number} date
 * @param {number} latitude - degrees, north positive
 * @param {number} longitude - degrees, east positive
 * @returns {{ elevation: number, azimuth: number }} elevation above the
 *   horizon (atmospheric refraction included), compass azimuth
 */
export function sunPosition(date, latitude, longitude) {
  const ms = date instanceof Date ? date.getTime() : date;
  // Julian century from J2000.0.
  const t = (ms / 86400000 + 2440587.5 - 2451545) / 36525;

  const meanLongitude = normalizeAngle(280.46646 + t * (36000.76983 + t * 0.0003032));
  const meanAnomaly = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const center =
    sin(meanAnomaly) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    sin(2 * meanAnomaly) * (0.019993 - 0.000101 * t) +
    sin(3 * meanAnomaly) * 0.000289;
  const trueLongitude = meanLongitude + center;
  const omega = 125.04 - 1934.136 * t;
  const apparentLongitude = trueLongitude - 0.00569 - 0.00478 * sin(omega);
  const meanObliquity =
    23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliquity = meanObliquity + 0.00256 * cos(omega);
  const declination = Math.asin(sin(obliquity) * sin(apparentLongitude)) / RAD;

  // Equation of time, in minutes.
  const y = tan(obliquity / 2) ** 2;
  const equationOfTime =
    (4 / RAD) *
    (y * sin(2 * meanLongitude) -
      2 * eccentricity * sin(meanAnomaly) +
      4 * eccentricity * y * sin(meanAnomaly) * cos(2 * meanLongitude) -
      0.5 * y * y * sin(4 * meanLongitude) -
      1.25 * eccentricity * eccentricity * sin(2 * meanAnomaly)) *
    RAD;

  const utcMinutes = (((ms % 86400000) + 86400000) % 86400000) / 60000;
  const trueSolarTime = (((utcMinutes + equationOfTime + 4 * longitude) % 1440) + 1440) % 1440;
  const hourAngle = trueSolarTime / 4 < 0 ? trueSolarTime / 4 + 180 : trueSolarTime / 4 - 180;

  const cosZenith = Math.min(
    1,
    Math.max(
      -1,
      sin(latitude) * sin(declination) + cos(latitude) * cos(declination) * cos(hourAngle),
    ),
  );
  const zenith = Math.acos(cosZenith) / RAD;
  const elevation = 90 - zenith;

  // Azimuth from the north, clockwise.
  const sinZenith = sin(zenith);
  let azimuth;
  if (Math.abs(sinZenith) < 1e-9 || Math.abs(cos(latitude)) < 1e-9) {
    azimuth = latitude > 0 ? 180 : 0;
  } else {
    const cosAzimuth = (sin(latitude) * cosZenith - sin(declination)) / (cos(latitude) * sinZenith);
    const angle = Math.acos(clamp(cosAzimuth)) / RAD;
    // Afternoon (positive hour angle): west of the meridian.
    azimuth = normalizeAngle(hourAngle > 0 ? angle + 180 : 540 - angle);
  }

  return { elevation: elevation + refraction(elevation), azimuth };
}

const clamp = (value) => Math.min(1, Math.max(-1, value));

/** Atmospheric refraction correction (degrees) for a true elevation. */
function refraction(elevation) {
  if (elevation > 85) {
    return 0;
  }
  const te = tan(elevation);
  let arcSeconds;
  if (elevation > 5) {
    arcSeconds = 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5;
  } else if (elevation > -0.575) {
    arcSeconds =
      1735 + elevation * (-518.2 + elevation * (103.4 + elevation * (-12.79 + elevation * 0.711)));
  } else {
    arcSeconds = -20.772 / te;
  }
  return arcSeconds / 3600;
}

/**
 * Angle between the sun and the outward normal of a vertical façade.
 * @returns {number} degrees, 0 = the sun faces the window, ≥ 90 = behind it
 */
export function incidenceAngle(sun, facadeAzimuth) {
  const cosIncidence = cos(sun.elevation) * cos(angleDifference(sun.azimuth, facadeAzimuth));
  return Math.acos(clamp(cosIncidence)) / RAD;
}

/**
 * Whether the sun can reach the windows of a façade: above the obstacles
 * (`min_elevation`), below the overhang (`max_elevation`), and within the
 * opening angle on each side of the façade's normal (`opening_angle`).
 */
export function sunReachesFacade(sun, facade) {
  return (
    sun.elevation >= facade.min_elevation &&
    sun.elevation <= facade.max_elevation &&
    Math.abs(angleDifference(sun.azimuth, facade.azimuth)) < facade.opening_angle
  );
}

// Share of the ground-reflected light: a typical urban / grass albedo.
const ALBEDO = 0.2;

/**
 * Power received by a vertical façade (W/m²), from the radiation components
 * measured on the horizontal: direct beam projected on the façade (only when
 * the sun reaches it), half the sky's diffuse light (a vertical wall sees half
 * the sky), and the light reflected by the ground.
 * @param {{ elevation: number, azimuth: number }} sun
 * @param {object} facade
 * @param {{ ghi: number, dni: number, dhi: number }} radiation
 */
export function facadeIrradiance(sun, facade, { ghi, dni, dhi }) {
  if (sun.elevation <= 0) {
    return 0;
  }
  const direct = sunReachesFacade(sun, facade)
    ? dni * Math.max(0, cos(incidenceAngle(sun, facade.azimuth)))
    : 0;
  const total = direct + 0.5 * dhi + 0.5 * ALBEDO * ghi;
  return Math.max(0, Math.round(total));
}

/**
 * Clear-sky radiation (W/m²) for a sun elevation: what the façades receive
 * when the weather service cannot be reached. A cloudless sky is the cautious
 * guess for shutters — better a lowered shutter than an overheated room.
 */
export function clearSkyRadiation(elevation) {
  if (elevation <= 0) {
    return { ghi: 0, dni: 0, dhi: 0 };
  }
  const airMass = 1 / (sin(elevation) + 0.50572 * (elevation + 6.07995) ** -1.6364);
  const dni = 1353 * 0.7 ** (airMass ** 0.678);
  const dhi = 0.1 * dni * sin(elevation) + 10;
  const ghi = dni * sin(elevation) + dhi;
  return { ghi: Math.round(ghi), dni: Math.round(dni), dhi: Math.round(dhi) };
}

/**
 * Instants of the next sunrise and sunset after `from`, searched minute by
 * minute over the next 24 hours (no closed form: the polar days and nights
 * simply return null).
 * @returns {{ sunrise: number|null, sunset: number|null }} epoch ms
 */
export function nextSunEvents(from, latitude, longitude) {
  const start = from instanceof Date ? from.getTime() : from;
  const STEP = 10 * 60000;
  const HORIZON = -0.833;
  let sunrise = null;
  let sunset = null;
  let previous = sunPosition(start, latitude, longitude).elevation;
  for (let time = start + STEP; time <= start + 86400000 && (!sunrise || !sunset); time += STEP) {
    const current = sunPosition(time, latitude, longitude).elevation;
    if (previous < HORIZON && current >= HORIZON && !sunrise) {
      sunrise = refine(time - STEP, time, latitude, longitude, HORIZON);
    } else if (previous >= HORIZON && current < HORIZON && !sunset) {
      sunset = refine(time - STEP, time, latitude, longitude, HORIZON);
    }
    previous = current;
  }
  return { sunrise, sunset };
}

/** Bisect the crossing of `horizon` between two instants, to the minute. */
function refine(low, high, latitude, longitude, horizon) {
  const rising = sunPosition(low, latitude, longitude).elevation < horizon;
  let a = low;
  let b = high;
  while (b - a > 60000) {
    const middle = (a + b) / 2;
    const below = sunPosition(middle, latitude, longitude).elevation < horizon;
    if (below === rising) {
      a = middle;
    } else {
      b = middle;
    }
  }
  return Math.round(b / 60000) * 60000;
}
