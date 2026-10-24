# `tent add`

Installs an npm package into the project, with the npm that the runtime came with. The install scripts of the package are switched off unless `--allow-scripts` is given.

## Usage

```
tent add <package> [--allow-scripts]
```

`<package>` is what npm installs: a name, a name with a version as `date-fns@4.1.0`, or a packed file. The package is written into `package.json` of the project and into its lock file, `package-lock.json`, which is part of the project. The `package.json` is the one that `tent new` wrote: a project that has none is told to write one, and nothing is installed. Nothing is installed outside the folder of the project.

An install script is code of the package that runs on this computer while it is installed. It is not run unless `--allow-scripts` is typed, so a package can do nothing here before its code is read. A package that needs its script, as one that builds a part of itself, says so in its own documents.

A backend file and a screen file import the package by its name. In a screen file the package is built into the browser files of the screens that use it, and a view that calls it is code.

## Example

```
tent add date-fns
tent add sharp --allow-scripts
```

## Output

With `--json`:

```json
{ "ok": true, "value": { "package": "date-fns", "scripts": false, "dependencies": { "date-fns": "^4.1.0" } }, "findings": [] }
```

`scripts` says whether the install scripts were run, and `dependencies` is what `package.json` of the project names after the install. Where npm cannot install the package, the command ends with what npm said.

## See also

`topic.commands`, `command.new`, `command.build`
