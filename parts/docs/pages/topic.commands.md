# The commands

`tent` is a thin shell: each command is a few lines over a part that a program can use by itself.

| Command | Does |
|---|---|
| `command.new` | Makes a project folder with a working sample and `AGENTS.md` |
| `command.check` | Builds the description, carries out every rule and the type checker, and prints every finding at once |
| `command.build` | Writes a bundle |
| `command.dev` | Builds, runs and watches the project: open pages follow each save |
| `command.shot` | Makes a picture of a screen of the app that runs, with a browser already on the computer |
| `command.export` | Writes the public part of the app out as plain files for any host of files |
| `command.add` | Installs an npm package into the project, with its install scripts switched off |
| `command.docs` | Prints a page of the docs |
| `command.map` | Prints the whole app as a short outline |
| `command.start` | Runs a bundle as a server |
| `command.run` | Calls a function, and prints what it answered and the lines of its log |
| `command.data` | The rows of a table, backups, a restore, a cleaning, and the data of one person |
| `command.logs` | Prints the newest calls, errors and slow queries |
| `command.access` | Prints one table of who can do what |
| `command.runs` | Lists the runs of the flows, and shows, moves, replays, answers or stops one |
| `command.test` | Runs the tests of the app |
| `command.mcp` | Offers the commands of the project as MCP tools to an AI on this computer |

## How a command is typed

A command that works on a project is typed in the folder of the project, the one that holds `tent.ts`, or in a folder inside it. What a command takes is given as a word after its name, or as `--name <value>`. A flag that takes a list is given once for each value. The reference writes each value as its flag, `tent new --name <text>`, and the pages as the word typed in its place, `tent new <name>`: a word that is no flag fills the first value that the command takes and that no flag gave, in the order the reference lists them, so `tent new my-app` is `tent new --name my-app`, and `tent data rows users` is `tent data rows --table users`.

A command that is one of several under one name is typed as two words, as `tent data rows`. A command that asks a running engine finds it through `--data <folder>`, and then needs no project, or through the `.tent/` of the project.

## Commands and a running engine

`run`, `data`, `logs` and `access` are carried out by the engine of the app, and never open its data themselves. An engine that runs writes `engine.json` into its data folder, with its port and a token, readable by the current user alone. A command reads that file in `.tent/` of the project, or in the folder that `--data` names, and sends the engine the command with the token, to an address that answers this computer alone. A file whose program runs no more was left behind: for it no engine runs. Where no engine runs for the project, the command builds the project, starts an engine for the length of the command, on the development data, and closes it again.

## `--version`

`tent --version`, or `tent -v`, prints the version of the `tentjs` that runs, in one line, as `0.1.0`, and ends with 0. With `--json` the version is the `value`. In a project, `npx tent --version` prints the version that the project holds.

## `--json`

Every command takes `--json`, and then prints one record: `{ "ok", "value", "findings" }`. `ok` is true when the command was carried out and no finding is an error. `value` is what the command answers, and `null` where it answers nothing. `findings` are the findings, each as `topic.errors` gives them. The standard output holds that record alone: what else is printed while the command runs, as by a plugin of the build, goes to the standard error.

## How a command ends

| Number | Means |
|---|---|
| 0 | No finding is an error |
| 1 | A finding is an error |
| 2 | The command itself failed: it was typed with a word, a flag or a value it does not take, or without one it needs, which is `code.T0038` with how it is typed; or it threw, which is `code.T0009` where the failure is no code of its own |
