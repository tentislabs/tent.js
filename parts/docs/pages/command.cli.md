# `tent cli`

Runs the app's own command line: each function and flow that states `offer: ['cli']` is a command, named after its definition with a hyphen and a small letter where the name has a capital, or by `cli.names` of the project. It is the runner with no launcher.

## Usage

```
tent cli <target> [--as <who>] [--data <folder>] [--yes] [--version] <command> [flags] [--input <json or ->] [--json] [--help]
tent cli <target> --help
```

## Options

| Option | Means |
|---|---|
| `--as <who>` | Before the command word: the caller, the id of a user, `nobody` or `system`. Left out, it is `system`, because whoever sits at this computer already holds its data |
| `--data <folder>` | Before the command word: the data folder of the engine. Left out, it is `.tent/` of the project; a bundle needs it |
| `--yes` | Before the command word: runs a function that asks a person without asking |
| `--version` | Before the command word: prints the name of the app's command, the version it runs, and the version of the runner |
| `--input <json>` | The whole input as one JSON object, and `-` reads it from the input. A flag beside it wins, field by field |
| `--json` | Prints the answer in the wire form, in one line |
| `--help` | Prints each command with its `about`, or after a command word its flags |

A flag is named after an input field the same way as a command: `--placed-at` is `placedAt`. Text, a choice, a link, a day and a date are written as they are; a number as a number; true or false as `--done`, and false as `--no-done` or `--done=false`; a list as the flag once for each entry; an object, a `json` and a vector as JSON text; a file as the path of a file of this computer, which the runner uploads first. `--name=value` is read as `--name value`.

The target is the folder of a project, the folder of a bundle with `--data`, or the address of a server.

With an engine running on the data folder the runner reaches it with its admin token, and the caller it acts for in `Tent-Caller`; the engine reads that header only beside the right admin token, on a request of this computer. With none running, it opens the app for the length of the command: a project is built and run on the development data. Every call passes all ten steps of the door, as from a page: `offer: ['cli']` opens nothing, and the rule of each function decides.

A function that states `danger: 'ask'` prints its question to the error output, with each flag and a `secret` field as `[secret]`, and waits for `y` or `yes`. With no person at the terminal it ends with 2, unless `--yes` was typed.

**Signing in in the browser.** `tent cli https://shop.example login` with no flag opens the browser at the app's own sign-in, where the person signs in the app's way and allows the command line, which is a program on their computer that will act as them in the whole app. The terminal prints a word of six letters, and the page shows the same word: allow only where they agree. The command line waits on a port of this computer for the browser to come back, and keeps the two tokens in `keys.json`, readable only by the current user; it renews them under a lock on that file, so two commands that run side by side renew once. `logout` ends the grant at the app and removes them. The person is asked every time. An app that states `cli: { login: 'key' }` turns this way off.

**Against a server.** The target is the address of the server: `tent cli https://shop.example login --key` asks for a key, or reads it from the input, asks the server who that is, and keeps it in `keys.json` of the runner's folder, readable only by the current user; `logout` takes it away, and `whoami` names the caller. `TENT_KEY` is taken in its place, and only for the address that `TENT_AT` names beside it. With neither, the caller is nobody. A server is reached over a secure connection, but this computer's own names and a host that `--insecure <host>` names; the runner follows no answer that leads to another host. `file <id> --out <path>` downloads a file that an answer named, and writes over a file that is there only with `--yes`. The runner keeps what it knows of the commands by their version, and asks for them again after a new one.

**The addresses of servers.** `tent cli add <address>` writes a launcher of the app's command into `bin/` of the runner's folder, named by the server; `tent`, the name of a launcher of another address, and a command that the terminal already finds are refused unless `--name <name>` gives another. It asks for a yes once, or takes `--yes`, because the commands that a server writes in code run on this computer with your rights: until the address is added, such a command runs no code. `tent cli list` shows the addresses that were added, and `tent cli remove <address>` takes its launcher, its kept modules, its key and its yes away. The runner's folder is what `TENT_HOME` names, or `.tent` of your own folder. `tent build` writes the launcher of a project that has commands into `.tent/bin/`. A launcher starts the `tent` of the install, which outlives every version.

## Example

```
tent cli . add-order --customer 01hx3v... --total 1999 --note "Call first"
tent cli . --as 01hx9k... open-orders --limit 5 --json
```

## Output

A text is printed as it is, a number as it is, and anything else as JSON with line breaks. A control character, but a line feed and a tab, is written as its code. An error is printed to the error output as `error <code> <name>: <message>`, with a line for each field and the fix. With `--json`:

```json
{"ok":true,"value":{"week":3,"sum":6}}
```

The command ends with 0 when it worked, 1 when the call failed, and 2 when the command itself could not be carried out: a word that is no command, a flag that is no field, an engine that cannot be reached, a caller of no user.

## Errors

`code.T1009` for a function offered to `cli` under one of the runner's words, `login`, `logout`, `whoami`, `help` and `file`, and `code.T1014` for a project whose command would be named `tent`. `code.T0011` for a target that is a file, or a path that is not there.

## See also

`topic.commands`, `option.project.cli`, `code.T7120`
