# Changelog

Every release of Tent.js, newest first. A version is three numbers: a change that breaks a project comes only with a new major version, and with `tent upgrade`, which rewrites a project for it.

## 1.0.1 - 2026-10-25

Fixes found by the first deploys from npm and by the automatic runs on Windows, macOS and Linux.

- **`tent start` from npm:** an app whose server modules share a file starts again; it ended with T0011.
- **Installing with npm on Ubuntu:** `tent` runs from folders that your own private group may write, as `npm install -g` makes them there.
- **`tent service` with an npm install:** names the right program, sets the working folder, and prints an administrator's line that works.
- **`tent start --seed --domain`:** applies the seed; it ended with T0017.
- **`tent check` of a new project with a test:** no longer reports T8000 inside the framework's own code.
- **macOS:** an app whose folder is reached through a link, as the temporary folder is, loads its modules.
- **Windows:** a file kept for you alone (keys, tokens) is readable by no other account also where its folder hands down no rights, and is written on a computer joined to Entra ID.
- **Linux:** `tent test` and `tent shot` drive the browser they download where Ubuntu 23.10 and later, or running as root, refuse its sandbox.
- **Scripts of `head`:** a script with `load: 'idle'` runs after those with `load: 'alive'`.
- **`tent new`:** the new project's site has the Tent.js mark as its icon, in `assets/icon.svg`.
- **`tent test --plan`:** fills a choice field.

## 1.0.0 - 2026-10-24

The first release.

- **Data:** tables with their columns and the rules of who reads and changes each row, vectors, files, and the data of each tenant apart.
- **Functions and flows:** queries, changes and actions, flows that survive restarts, schedules, and mail.
- **AI:** models, agents with their tools, and workspaces: apps that the users of a product build inside it, by hand or with an AI.
- **Screens:** React views with their data, forms, links, components, layouts, images, languages, and pages drawn on the server and updated live.
- **Connected both ways:** services with their keys, limits and retries; the app's functions as an API with access keys, as an MCP server and as a command line; incoming calls from other services.
- **History:** every change of the app recorded in its own terms, and going back with its data.
- **Tools:** `tent new`, `dev`, `check`, `test`, `build`, `map`, `docs` and every other command, each with `--json`; the docs and `AGENTS.md` in every project.
- **Running it:** `tent start` on any server, with HTTPS for your domains, and many readers beside one writer; installed with npm.
