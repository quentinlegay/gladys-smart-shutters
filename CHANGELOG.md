# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [0.0.1] - 2026-10-17

### Added

- Smart shutter recommendations per façade, from the position of the sun
  (computed locally from the location of the Gladys house) and the weather of
  Open-Meteo (free, no account): wind protection, closing at night, heat
  protection on hot days (anticipated from the morning forecast), free solar
  heating on cold days, glare protection in between, open under clouds or
  without sun on the façade.
- Façades managed from the Configuration screen (add, edit, remove): name,
  orientation or exact azimuth, opening angle, minimum and maximum sun heights
  (obstacles, overhangs), glare and heat positions.
- Anti-flapping: shading hysteresis, a minimum delay between moves and a
  minimum move; wind and night always apply at once.
- Devices: "Sun & weather" (sun elevation and azimuth, irradiance, clouds,
  temperature, gusts, UV index) and one device per façade (recommended
  position, automation switch, sun on the façade, irradiance on the façade,
  reason).
- Scene triggers: shutter position recommended, sun on a façade (arrived /
  left), wind protection (started / ended), hot day forecast.
- Scene actions: get the recommended position, pause the automation (for a
  while or until resumed), resume the automation.
- Dashboard widgets: shutters of a façade (with the positions expected over
  the next 12 hours), sun and weather (with the irradiance outlook), all
  shutters (with pause / resume buttons).
- Cloud transport badge, degraded when Open-Meteo cannot be reached: the last
  forecast is used for 3 hours, then a clear sky computed locally.
- Documentation in English, French, German and Spanish.
- CI (format, lint, tests on Node 22 and 24, Docker build), UI-driven Release
  workflow, multi-arch image build and GitHub Releases.

[Unreleased]: https://github.com/quentinlegay/gladys-smart-shutters/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/quentinlegay/gladys-smart-shutters/releases/tag/v0.0.1
