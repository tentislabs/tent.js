# `tent secrets`

Sets, removes and lists the secrets of an app: the values that a definition names with `secret('NAME')` and that code opens with `secrets.NAME.reveal()`. It never prints a value.

## Usage

```
tent secrets set <NAME> [--live] [--data <folder>] [--to <name or address>]
tent secrets remove <NAME> [--live] [--data <folder>] [--to <name or address>]
tent secrets list [--live] [--data <folder>] [--to <name or address>]
tent secrets key [--replace] [--data <folder>]
```

`set` asks for the value without showing it. With no person at the keys it reads the value from its input, so a script and a coding agent can set one: `echo "$VALUE" | tent secrets set PAY_KEY`.

Each command works on the secrets of test data, which the modes `development` and `test` read, and with `--live` on those of live data.

With an engine running on the data folder, the command hands the value to it: the engine, which holds the key, writes the file and uses the new value from the next use on. With none running the command writes the file itself.

## Options

| Option | Means |
|---|---|
| `--live` | The secrets of live data, in place of those of test data |
| `--to <name or address>` | Hands the value to the engine of a far server, with the key of the right `publish` that `tent login` kept for it, or lists the names set there: the mode of that server says which file. With `--insecure <host>` over a plain connection. A secret is never part of a version, a point or a blob |
| `--data <folder>` | The data folder. Left out, it is `.tent/` of the project |
| `--replace` | With `key`: makes a new key and seals everything again under it |

**Where the values are kept.** In the data folder, `secrets.test` and `secrets.live`, each value encrypted by itself under the key of the secrets, and bound to its name and to its file: a value that is moved to another name or to the other file does not open.

**The key.** On a computer of your own it is the file `secret.key` of the data folder, which only you can read. `tent secrets set` makes it the first time, where no key is given and no secrets file is there yet. On a server the key is given to the engine as the variable `TENT_SECRET_KEY`, so that the data folder alone opens nothing, and the variable wins over the file. `tent secrets key` prints a new key and keeps nothing: it is how the value of the variable is made. Where a secrets file is there and the key at hand does not open it, or no key is at hand, the command stops, names `TENT_SECRET_KEY` and writes nothing. `.tent/` is in `.gitignore` of a new project, so the key and the files are never put into a shared repository.

**A new key for what is there.** `tent secrets key --replace`, with the engine stopped, makes a new key and seals every secret and every value of a `sealed` column again under it, and makes the fingerprint of each findable value anew with it in the same write, so an equal value still finds its row: the shared data file in one write, and the data file of each tenant that holds a sealed column in one write of its own, one after another. The new key is written first, as `secret.key.next`, and takes the place of `secret.key` when the last value is sealed: a run that is stopped half way is finished by the next one, and by the engine when it opens, so no moment leaves data that no key opens. Where the key is the variable `TENT_SECRET_KEY`, the command prints the new key and waits for a `yes` that it was kept, and the engine is started with the new key from then on. On the data folder of a reader the command makes no key and seals no data: lay the `secret.key.next` that the run on the writer made into the folder, let the reader join its writer, and run the command there. It answers how many values and how many secrets it sealed again:

```json
{ "ok": true, "value": { "role": "writer", "sealed": 24, "secrets": 2 }, "findings": [] }
```

## Example

```
tent secrets set PAY_KEY
tent secrets set PAY_KEY --live
tent secrets list --json
```

## Output

With `--json`, `set` and `remove` print the name and whether it is set now, `list` the names that are set and those that a definition names and that are not, and `key` a new key:

```json
{ "ok": true, "value": { "name": "PAY_KEY", "set": true }, "findings": [] }
{ "ok": true, "value": { "set": ["PAY_KEY"], "missing": ["MAIL_SERVER"] }, "findings": [] }
{ "ok": true, "value": { "key": "q0V5t...=" }, "findings": [] }
```

## Errors

`code.T0019` when a secret is set with no key at hand, or under a key that does not open the secrets file that is there.

`code.T0002` when no value is given.

`code.T0013` when `key --replace` meets an engine that runs on the data folder, a new key that was not kept, the folder of a reader with no `secret.key.next` laid into it, or with a value that its writer has not handed it yet.

## See also

`handle.secrets`, `command.settings`, `code.T3007`, `code.T3011`
