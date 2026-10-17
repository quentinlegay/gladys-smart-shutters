# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
Open-Meteo (report its vulnerabilities to Open-Meteo), and the shutters and
their own integrations, which Gladys scenes drive.

## Data and permissions

The integration has no credential: Open-Meteo needs no account and no key.

It asks Gladys for the location of the houses (manifest `"location": true`,
shown on the install screen) and sends the coordinates of one house, rounded
to four decimals (about 10 m), to `api.open-meteo.com` — nothing else leaves
the container. It never logs the coordinates.

It never drives a device of another integration: it only publishes its own
devices and scene events, and a scene written by the user moves the shutters.
Its state (`/data/smart-shutters-state.json`) holds the façades, their last
positions and the pauses.

A report showing the location leaking elsewhere (logs, another host, a widget
of a shared dashboard beyond the house name), a way to make the integration
reach another host, or a way to drive a device through it, is in scope.
