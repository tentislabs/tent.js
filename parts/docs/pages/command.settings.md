# `tent settings`

Sets, removes and lists the values of the settings that the project states. A setting is a value that whoever runs the app may set, with no build.

## Usage

```
tent settings set <name> <value> [--live] [--data <folder>] [--to <name or address>]
tent settings remove <name> [--live] [--data <folder>] [--to <name or address>]
tent settings list [--live] [--data <folder>] [--to <name or address>]
```

`set` holds the value to the type of the setting: a text is taken as it is typed, and any other type is read as JSON, as `20`, `true` or `'["new","sale"]'`. `remove` puts the default of the type back.

Each command works on the settings of test data, which the modes `development` and `test` read, and with `--live` on those of live data.

With an engine running on the data folder, the command hands the value to it: the engine writes the file, uses the new value at once, and runs every live query again, since a query may read a setting. An open page is handed the new public values the next time it asks for a screen. With none running the command writes the file itself.

## Options

| Option | Means |
|---|---|
| `--live` | The settings of live data, in place of those of test data |
| `--to <name or address>` | Hands the value to the engine of a far server, with the key of the right `publish` that `tent login` kept for it, or lists the names that are set there, and never a value. With `--insecure <host>` over a plain connection |
| `--data <folder>` | The data folder. Left out, it is `.tent/` of the project |

The values are kept in the data folder, in `settings.test` and `settings.live`, not encrypted: what must be kept from a reader of the folder is a secret, and is set with `tent secrets`.

## Example

```
tent settings set shopName "The other shop"
tent settings set maxItems 20 --live
tent settings list
```

## Output

With `--json`, `set` and `remove` print the setting with the value it has now, and `list` every setting of the project:

```json
{ "ok": true, "value": { "name": "maxItems", "set": true, "value": 20 }, "findings": [] }
{ "ok": true, "value": { "settings": [{ "name": "maxItems", "value": 20, "set": true, "public": false }] }, "findings": [] }
```

`set` says whether a value was set for the setting: where none was, `value` is the default of its type.

## Errors

`code.T0002` when the project states no setting of that name, and when the value does not fit the type of the setting.

## See also

`handle.settings`, `command.secrets`, `word.project`
