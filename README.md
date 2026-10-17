# Gladys Smart Shutters

[Gladys Assistant](https://gladysassistant.com) external integration that
manages your shutters with the sun, the clouds, the heat and the wind: for
each façade of your house, the position its shutters should take and why, as
scene triggers and actions, devices and dashboard widgets.

Built with the JavaScript SDK
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
from the official
[integration template](https://github.com/GladysAssistant/integration-template-js).

- **Type**: `device` — **transport**: `cloud` (Open-Meteo weather; the sun
  position is computed locally)
- **Requires**: Gladys ≥ 5.2.0 and the location of the house set in Gladys —
  no account, no API key
- **User documentation**: [English](docs/en.md) · [Français](docs/fr.md) ·
  [Deutsch](docs/de.md) · [Español](docs/es.md)

## Features

| Surface           | What you get                                                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Façades           | Added from the Configuration screen: orientation or exact azimuth, opening angle, minimum / maximum sun heights (obstacles, overhangs), glare and heat positions                            |
| Decisions         | Wind protection → night → sun on the façade (heat protection, free solar heating or glare protection, from the temperature and today's forecast) → open                                     |
| Stability         | Shading hysteresis, minimum delay between moves, minimum move; wind and night at once                                                                                                       |
| Devices           | "Sun & weather" (sun elevation and azimuth, irradiance, clouds, temperature, gusts, UV) and one per façade (recommended position, automation switch, sun on the façade, irradiance, reason) |
| Scene triggers    | `position_changed` (filter by façade and reason), `sun_on_facade` (arrived / left), `wind_protection` (started / ended), `heat_day`                                                         |
| Scene actions     | `get_recommendation`, `pause_automation` (one or every façade, for a while or until resumed), `resume_automation`                                                                           |
| Dashboard widgets | `facade` (live tiles, the next 12 hours of positions, pause / resume), `sun_weather` (live tiles, irradiance outlook, sunrise / sunset), `overview` (every façade)                          |
| Configuration     | Actions "Add / Edit / Remove a façade", "Refresh now"; house, refresh interval, thresholds, night and wind positions, anti-flapping                                                         |
| Transport badge   | `cloud`, orange dot when Open-Meteo is unreachable (last forecast for 3 hours, then a clear sky computed locally)                                                                           |

## How it works

```
Gladys house location ──┐
                        ├─► sun position (src/solar.js, local)
Open-Meteo forecast ────┘          │
  temperature, clouds, gusts,      ▼
  direct / diffuse radiation  per façade: irradiance on the façade,
                              decide() → stabilize()  (src/engine.js)
                                   │
            ┌──────────────────────┼─────────────────────────┐
            ▼                      ▼                         ▼
   device states          scene trigger              widgets nudged
 (position, reason…)   position_changed {position}
                                   │
                                   ▼
                     user scene: set the real shutters
                     to {{triggerEvent.data.position}}
```

The integration never drives another integration's device: a Gladys scene
applies the recommendation to the real shutters, whatever their protocol.

Every refresh (10 minutes by default, 5 minimum) costs one Open-Meteo request
for every façade at once.

## Project structure

```
index.js                 SDK instance, shutdown, connect()
src/app.js               every SDK handler, config lifecycle
src/controller.js        refresh loop, triggers, fallbacks, pauses
src/engine.js            decisions, hysteresis, anti-flapping (pure)
src/solar.js             sun position, façade irradiance, clear sky (pure)
src/weather.js           Open-Meteo client
src/facades.js           façades and Gladys devices
src/triggers.js          scene trigger keys and data
src/scenes.js            scene actions
src/widgets.js           dashboard widgets
src/actions.js           Configuration screen actions
src/config.js            defaults and normalization
src/i18n.js              shared texts (en, fr, de, es)
src/store.js             /data state
docs/                    user documentation (en, fr, de, es)
test/                    node --test, fake Gladys and fake Open-Meteo
```

## Development

```bash
npm install
npm test               # unit and end-to-end tests (node --test), no network
npm run lint           # ESLint
npm run format:check   # Prettier
```

The tests drive the whole integration (`src/app.js`) against the SDK's fake
Gladys (`createFakeGladys`, which refuses what the real host API refuses) and a
fake Open-Meteo API
([`test/helpers/fakeOpenMeteo.js`](test/helpers/fakeOpenMeteo.js)). The solar
equations are checked against reference values, widget contents with
`validateWidgetContent`, scene events and outputs against the manifest
declarations.

Run it against a real Gladys:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="smart-shutters" \
SMART_SHUTTERS_DATA_DIR=./data \
LOG_LEVEL=debug \
npm start
```

Check the store admission rules locally (the image check only passes once a
version is released):

```bash
npx github:GladysAssistant/integration-store .
```

## Release

1. Describe your changes under `## [Unreleased]` in
   [`CHANGELOG.md`](CHANGELOG.md).
2. Open **Actions → Release → Run workflow** and pick `patch`, `minor` or
   `major` (the repository starts at `0.0.0`: pick `minor` for `0.1.0` or
   `major` for `1.0.0`).
3. The workflow bumps `package.json`, `package-lock.json` and the manifest
   (`version` + `docker_image`), moves the changelog section under the new
   version, tags `vX.Y.Z`, builds the `linux/amd64` + `linux/arm64` image to
   `ghcr.io/quentinlegay/gladys-smart-shutters` (`:X.Y.Z` and `:latest`) and
   publishes the GitHub Release.

To be listed in the Gladys integration store, the repository must be public
and carry the GitHub topic `gladys-assistant-integration`, and the GHCR
package must be public. Turn on **Private vulnerability reporting** in the
repository's security settings: [`SECURITY.md`](SECURITY.md) sends reporters
there.

## License

Apache-2.0. Weather data by [Open-Meteo](https://open-meteo.com/) (CC BY 4.0).
