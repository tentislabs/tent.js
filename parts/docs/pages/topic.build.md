# The build

The build turns the folder of a project into a description and a bundle. `buildProject` of `tentjs/build` does it, and `tent build` is a few lines over it.

```ts
import { buildProject } from 'tentjs/build'

const { description, bundleFolder, versionId, findings } = await buildProject('./my-app', { for: 'release' })
```

| Option | Means |
|---|---|
| `for` | `'dev'` keeps the code as it is written, and `'release'` makes it small. A description that was built for `'dev'` says so |
| `out` | The folder of the bundle. Left out, it is `.tent/build/<version id>/` in the project |
| `secrets` | The secret values of this computer, which the guard searches the finished browser code for (`code.T3007`) |

## What it does

1. It reads every `.ts` and `.tsx` file of the folder, but `.tent/`, `node_modules/` and `tests/`, and `seed.ts`, `engine.ts`, `tent.clash.ts` and `tent.d.ts` in its root. A file that imports none of `tentjs`, `tentjs/ui` and `tentjs/cli` is a helper: the build reads it and takes no definition from it, never runs it by itself, and builds it into each file that imports it, on the server for a backend file and in the browser for a screen file. A helper that nothing imports is in no bundle: a script of the project's own, as the walk of a test in `walk/`, is left alone. The type checker reads it with the rest: the checker of `tent check` and of `tent dev` reads every `.ts` and `.tsx` file of the folder, `tests/` and `walk/` among them, but `seed.ts`, `engine.ts` and `tent.clash.ts` in its root, `assets/`, `node_modules/` and each `.d.ts` file. So a script that imports a package which the project has not installed is a finding of `code.T8000`, and `tent dev` shows it on every open page, until the package is installed (`command.add`) or the script lies outside the folder of the project.
2. It sorts each file by what it imports: `tentjs` makes a backend file, `tentjs/ui` a screen file, `tentjs/cli` a command file. A file that imports two of them is refused (`code.T1005`).
3. It loads each backend file, and then each screen file. A backend file that holds only definitions written with our words is read as text and never run. Any other file, and every screen file, is built and run once, to collect its definitions.
4. It reads each `run`, each `onFail` and the arrow of each rule, and of a screen its `data`, its `title` and its search-engine fields. One that holds only our words is stored as it was read. Any other is code, and the build says what made it so. A view is always code.
5. It writes `tent.d.ts`, the list of the definitions for the type checker, where it differs from what stands there: a build of a project whose names did not change leaves the file as it is. It is a made file, which `tent check` and `tent build` make anew whenever it is missing. The `.gitignore` of a new project leaves it out of git, and a point of the history holds it as it holds every file of the project (`topic.history`). For a project with a screen file the list also gives `tentjs/ui` the state of `project`.
6. It builds one module for each backend file that holds code, named by its fingerprint. The module exports the definitions of the file, and beside them the code of each rule and of each option that is code, under the name that the description gives it: `orders_access_read`, `refund_access`, `ship_onFail`, `project_identify`.
7. For a project that holds a screen it makes the files of a browser: a module for each screen and for each component with the style files it imports, and for each view a module that draws it on the server. A screen file that imports a backend file is handed a stub of each definition in its place (`topic.screens`). The builder is started only for a project that holds code.
8. The guard searches the finished browser code for each secret value that the build was handed, and fails where one is found (`code.T3007`).
9. It writes the bundle, with `description.json` last and `description.schema.json` beside it.

With an error among the findings no bundle is written.

**The settings of TypeScript.** The builder reads the project's own `tsconfig.json`, in the folder of the project, where it has one, and never one of a folder above the project. A project with none is built with the framework's own settings, as the type checker reads it: `tent new` writes no `tsconfig.json`. A `tsconfig.json` of the project that `extends` a file which is not there fails the build with "Tsconfig not found", reported as `code.T1014` with the path it looked for.

A build with `for: 'dev'` writes a source map for every module it writes, beside it under the same name with `.map` after it: the server modules, the modules of the screens and the components for a browser and for the server, and the page code's own. Each names its sources by their paths from the folder of the project, and holds them as they are written. The browser module of a view ends with the name of its map. No map of a browser module holds a line of a backend file. A build with `for: 'release'` writes no map, and the engine serves a map in the mode `development` alone.

`watchProject(folder, saved)` watches the folder of a project with the builder's own watcher, and calls `saved` with each file that was saved, added or removed. What lies in `.tent/` and in `node_modules/`, and `tent.d.ts`, is no save. It answers `{ close }`, which ends the watching. `buildSaved(folder)` builds for development as `buildProject` does, and answers with it the `source` that the build read and the `roots` of the project, so that the rules of the check are held against the same reading. `command.dev` is built on the two.

## What it finds

`code.T1001`, `code.T1005`, `code.T1006`, `code.T1010` and `code.T3007` are the build's own, and `code.T1014` for a file that the project names and that lies outside its folder and its `roots`. The other codes of the first group are found while the definitions are described.

The same folder gives the same version id on every system: a version is named by the fingerprint of its description.
