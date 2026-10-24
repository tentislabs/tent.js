# `tent new`

Makes a bare project folder - one screen and the query it reads - with `AGENTS.md`, the short index that every coding agent reads first.

## Usage

```
tent new <name>
```

`<name>` is the name of the folder: letters and digits, with a hyphen between words. The project is named the same in camelCase, so `tent new my-app` makes the project `myApp` in the folder `my-app`.

## Example

```
tent new my-app
cd my-app
tent check
```

The new project holds `tent.ts`, a query `greeting` in `functions/greeting.ts`, a screen `homeScreen` at `/` in `screens/home.tsx` that shows what the query answers, `AGENTS.md`, an ordinary `package.json`, and a `.gitignore` that leaves `.tent/`, `node_modules/`, `results/` and `tent.d.ts` out. Both definitions are open to anyone, with the reason written into each rule, so the screen runs before any sign-in exists. Everything else - tables, a sign-in, a look - is the project's own: `topic.start` walks a whole app from here, and `topic.signIn` writes a sign-in.

`package.json` holds the name of the folder, `"private": true`, `"type": "module"`, and under `engines` the version of `tentjs` that wrote the project. `tent add` writes each package that it installs into it, and a screen may import any of them.

## Output

With `--json`:

```json
{ "ok": true, "value": { "folder": "my-app", "files": ["tent.ts"] }, "findings": [] }
```

## See also

`topic.start`, `command.check`, `command.add`, `topic.commands`
