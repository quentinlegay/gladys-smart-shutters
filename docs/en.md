# Smart Shutters

Smart Shutters moves your shutters with the sun, the clouds, the heat and the
wind. It computes where the sun is at your house, reads the weather from
[Open-Meteo](https://open-meteo.com/) (free, no account, no key), and tells
Gladys, for each façade of your house, the position its shutters should take
and why.

It does not drive your shutters directly: it fires a scene trigger with the
recommended position, and a Gladys scene applies it to your real shutters
(Zigbee, Z-Wave, MQTT, Matter…). You keep full control over which shutters
follow which façade.

## Requirements

- Gladys Assistant 5.2 or later.
- The location of your house set in Gladys (**Settings → Houses**): the
  integration asks for it at install time, it places the sun.
- An internet connection for the weather. Without it, the integration keeps
  working in a degraded mode (see [Offline](#offline)).

## Setting it up

1. Install the integration and accept the access to the location of your
   houses.
2. In the **Configuration** screen, check the settings (the defaults suit most
   homes) and save.
3. Click **Add a façade** for each group of windows facing the same way: the
   living room bay windows, the bedrooms, the kitchen… Give it a name and an
   orientation. For more precision, enter the exact **azimuth** of the façade
   (the direction its windows look to, in degrees: 0 = north, 90 = east,
   180 = south, 270 = west); a compass app held flat against the window gives
   it.
4. Open the **Discovery** tab of the integration and add the **Sun & weather**
   device and one device per façade.
5. Create a scene per façade:
   - trigger: **Shutter position recommended**, filtered on the façade;
   - action: set the position of the shutters of that façade to the
     `{{triggerEvent.data.position}}` variable (0 % = closed, 100 % = open).

That is all: from now on, the shutters follow the sky.

### Façade settings

| Setting               | Default | Meaning                                                                   |
| --------------------- | ------- | ------------------------------------------------------------------------- |
| Orientation / azimuth | South   | Where the windows look to.                                                |
| Opening angle         | 80°     | How far to each side of the façade the sun still enters the room.         |
| Minimum sun height    | 5°      | Below it, buildings, trees or hills hide the sun.                         |
| Maximum sun height    | 90°     | Above it, a balcony or an overhang shades the windows (90 = no overhang). |
| Glare position        | 30 %    | The position against the glare, on a mild day.                            |
| Heat position         | 10 %    | The position that keeps the heat out, on a hot day.                       |

Use **Edit a façade** to change them (a blank field keeps its value) and
**Remove a façade** to delete one.

## How the position is chosen

Every 10 minutes (the **Refresh interval**), for each façade, from the
strongest rule to the weakest:

1. **Wind** — gusts above the **wind gusts threshold** (50 km/h): every
   façade moves to the **wind position** (100 % = fully raised, which protects
   rolling shutters and exterior blinds). It ends when the gusts fall under
   80 % of the threshold.
2. **Night** — the sun is under the **night elevation** (-4°, a little after
   sunset): the **night position** (closed). Can be turned off.
3. **Sun on the façade** — the sun is within the façade's opening angle and
   sun heights, the power it brings on the façade is above the **sun power
   threshold** (200 W/m²) and the sky is not overcast (cloud cover under
   80 %):
   - hot day (outdoor temperature at or above the **heat threshold**, 25 °C,
     or today's forecast maximum reaching it when **Anticipate hot days** is
     on): the **heat position**;
   - cold day (under the **cold threshold**, 15 °C): open, the sun heats the
     house for free;
   - in between: the **glare position**, if **Glare protection** is on.
4. Otherwise (no sun on the façade, clouds): open.

So that a passing cloud does not make the shutters dance:

- shading starts at the sun power threshold and stops at 75 % of it;
- a new position is sent at most every **minimum delay between moves**
  (20 minutes), and only when it moves the shutters by at least the
  **minimum move** (10 points);
- wind and night always apply at once.

The power on the façade is computed from the direct, diffuse and reflected
radiation forecast by Open-Meteo and from the angle between the sun and the
façade: a south façade at noon in summer receives far less than in winter,
when the sun is low.

## Devices

**Sun & weather**: sun elevation and azimuth, global irradiance (W/m²), cloud
cover, outdoor temperature, wind gusts and UV index.

**One device per façade**:

- **Recommended position** — what the automation recommends (0–100 %);
- **Automation** — a switch: off pauses the façade (no position is sent),
  on resumes it;
- **Sun on the façade** — 1 when the sun reaches the windows;
- **Irradiance on the façade** (W/m²);
- **Reason** — why: wind protection, night, heat protection, glare
  protection, sun let in, cloudy, no sun on the façade.

## Scene triggers

- **Shutter position recommended** — the recommended position of a façade
  changed (automation on). Filters: façade, reason. Variables: `position`,
  `previous_position`, `reason`, `facade_name`, `irradiance`,
  `sun_elevation`.
- **Sun on a façade** — the sun starts or stops reaching a façade. Filters:
  façade, arrived / left. Variables: `phase`, `facade_name`,
  `sun_elevation`, `sun_azimuth`.
- **Wind protection** — the gusts go over the threshold, or back under it.
  Filter: started / ended. Variables: `phase`, `wind_gusts`, `wind_speed`,
  `position`.
- **Hot day forecast** — today's forecast maximum reaches the heat threshold
  (once a day, after sunrise): close the shutters early, notify, start the
  fans… Variables: `temperature_max`, `temperature`.

## Scene actions

- **Get the recommended position** of a façade: outputs `position`,
  `reason`, `reason_label`, `sun_on_facade`, `irradiance`, `automation`.
- **Pause the automation** of a façade, or of all of them when the façade is
  left empty, for a duration in minutes (0 = until resumed): outputs
  `paused_count`, `resume_at`. Handy when you leave on holiday, watch a film
  or take a nap.
- **Resume the automation**: outputs `resumed_count` and, for one façade,
  `position`, the current recommendation, to apply it right away.

Resuming never moves the shutters by itself: use the `position` output, or
wait for the next change of the recommendation.

## Dashboard widgets

- **Shutters of a façade** — position and power on the façade (live), sun
  height, the reason, the automation, the positions expected over the next
  12 hours, and a pause / resume button.
- **Sun and weather** — sun height, clouds, temperature, gusts and UV index
  (live), the irradiance expected over the next 12 hours with sunrise and
  sunset, today's maximum and the wind protection.
- **All shutters** — every façade with its position and reason, and buttons
  to pause or resume them all.

## Configuration actions

- **Add a façade**, **Edit a façade**, **Remove a façade**.
- **Refresh now** — reads the weather, recomputes every façade and shows the
  result.

## Offline

When Open-Meteo cannot be reached, the devices show an orange dot and:

- for 3 hours, the integration uses the last forecast it received;
- then it assumes a clear sky, computed locally: the shutters protect from
  the sun as on a sunny day, without the temperature (glare protection only);
  the wind protection stays as it was.

Everything goes back to normal at the next successful refresh.

## Privacy

The only data leaving your house is the location of the house, rounded to
about 10 m, sent to Open-Meteo to get the forecast. No account, no key, no
other personal data.

## Troubleshooting

- **"No Gladys house has coordinates"**: set the location of your house in
  **Settings → Houses**, or pick a located house in the configuration.
- **The devices have no values**: add them from the **Discovery** tab; their
  values arrive at the next refresh (or click **Refresh now**).
- **The shutters close too early or too late**: adjust the opening angle and
  the sun heights of the façade, or the sun power threshold.
- **The shutters move too often**: raise the minimum delay between moves or
  the minimum move.
