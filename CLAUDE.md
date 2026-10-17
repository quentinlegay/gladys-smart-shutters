# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

The **Smart Shutters** external integration of Gladys Assistant: a Node.js
service (Node 22+, ESM, no build step) that runs in its own sandboxed Docker
container and talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency, and to the
[Open-Meteo forecast API](https://open-meteo.com/en/docs) (free, no key) with
the global `fetch`. It started from the official
[JavaScript template](https://github.com/GladysAssistant/integration-template-js).

For each façade the user declares, it computes the position the shutters
should take (sun, clouds, heat, wind) and announces it with a scene trigger;
a Gladys scene written by the user moves the real shutters. The integration
never drives another integration's device (the SDK gives it no way to).

It is a **cloud** integration (manifest `transports: ["cloud"]`): the weather
comes from api.open-meteo.com. The sun position and the clear-sky fallback are
computed locally, but there is no LAN channel to prefer, so the manifest does
not declare `local` (which would show a useless "Prefer local" toggle).

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/engine.test.js           # one file
node --test --test-name-pattern "wind"    # tests whose name matches
LOG_LEVEL=silent npm test                 # without the integration logs
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store .   # store admission checks
```

The CI (`.github/workflows/ci.yml`) runs `format:check`, `lint` and `test` on
Node 22 and 24, and builds the Docker image: run the three commands before
pushing.

## Architecture

```
index.js                          SDK instance, shutdown, connect() — nothing else
src/app.js                        every SDK handler, registered before connect(); config lifecycle
src/config.js                     DEFAULT_CONFIG + LIMITS (mirror the manifest), normalization
src/solar.js                      pure: sun position (NOAA), façade incidence/irradiance, clear sky, sunrise/sunset
src/engine.js                     pure: decide() (priorities, hysteresis), stabilize() (anti-flapping), forecast
src/weather.js                    Open-Meteo client (injectable fetch) + parseForecast
src/controller.js                 refresh loop: location -> weather/fallback -> decisions -> states, triggers, badges
src/facades.js                    façade model (action fields), Gladys devices and their external ids
src/triggers.js                   scene trigger keys + event data (manifest `scene_triggers`)
src/scenes.js                     scene action handlers (manifest `scene_actions`)
src/widgets.js                    dashboard widget handlers (manifest `widgets`)
src/actions.js                    Configuration screen buttons (manifest `actions`): façades, refresh
src/i18n.js                       shared user-facing texts (en, fr, de, es)
src/store.js                      /data/smart-shutters-state.json: façades, last positions, pauses, wind, heat day
gladys-assistant-integration.json manifest
docs/{en,fr,de,es}.md             user documentation, re-hosted by Gladys (mandatory)
test/                             node --test, SDK fake Gladys + test/helpers/fakeOpenMeteo.js (fake `fetch`)
.github/scripts/release.mjs       release helpers (manifest bump, changelog), tested in test/
```

## Rules

- **External ids are forever.** The sun device is
  `gladys.externalIds('sun', 'local')`, a façade device
  `gladys.externalIds('facade', <random id drawn when it was added>)` — never
  its name, which the user can edit. The feature keys of `SUN_FEATURE` and
  `FACADE_FEATURE` in `src/facades.js` are never renamed. The same goes for
  every key users store: manifest `config_schema`, `actions` and their
  fields, `scene_triggers`, `scene_actions`, `widgets` and their settings,
  and the select option values (orientations, reasons, phases).
- **Positions follow the Gladys shutter convention**: 0 % = closed,
  100 % = open.
- **Scene triggers fire on transitions only**, never on every refresh: a
  position once per change (after anti-flapping, automation on), the sun on a
  façade when it arrives or leaves, the wind protection when it starts or
  ends, the heat day once per local day. What must not fire twice survives a
  restart in `/data`. Event `data` only carries the keys the manifest declares
  (`test/scenes.test.js`).
- **No loops.** A scene action, the automation switch and a widget button
  never fire a trigger, directly or by running a refresh: a scene bound to
  that trigger would loop through the integration. Resuming does not re-send
  the position (`resume_automation` outputs it instead).
- **Stability first.** Wind and night apply at once; anything else goes
  through `stabilize()` (minimum delay, minimum move) and the shading
  hysteresis. Never add a decision path that bypasses them.
- **Offline is a mode, not an error.** Open-Meteo unreachable: the last
  forecast for 3 hours, then the clear-sky model; the device badges turn
  degraded, the connection status stays connected, the wind protection keeps
  its state. Only a missing house location disconnects.
- **Open-Meteo quotas** (10,000 requests a day for non-commercial use): one
  request per refresh for every façade, never one per façade; keep the
  5-minute floor of `refresh_interval`.
- **Privacy.** The house coordinates only go to Open-Meteo, rounded to four
  decimals. Never log them.
- **The container rootfs is read-only.** Write only under `/data`
  (`SMART_SHUTTERS_DATA_DIR` overrides it, for local runs).
- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or in the manifest, nor the `docker_image` tag,
  by hand. `test/manifest.test.js` checks they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]`
  in `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`).
  Never write a version heading: the Release workflow moves the section.
- **Manifest.** Texts are multi-language objects
  `{ "en": ..., "fr": ..., "de": ..., "es": ... }`
  (`label`, `description`, `placeholder`), never plain strings; the catalog
  `description` holds 10 to 100 characters per language, a widget label
  between 3 and 30. `scene_triggers`, `scene_actions` and `widgets` require
  `gladys_version` `>=5.1.0`, the `source: "houses"` select `>=5.2.0`.
  Every feature declares `min` and `max` (Gladys refuses the device
  otherwise, text features included). `test/manifest.test.js` ties the
  manifest to the code (handlers, defaults, bounds, options): change both
  sides together.
- **User-facing text** exists in English, French, German and Spanish
  (`en`, `fr`, `de`, `es`): action messages, widget contents, transport
  messages, manifest texts, and `docs/en.md` / `fr.md` / `de.md` / `es.md`,
  kept in sync.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network: Open-Meteo goes through
  `test/helpers/fakeOpenMeteo.js`, Gladys through the SDK's
  `createFakeGladys`.
