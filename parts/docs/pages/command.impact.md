# `tent impact`

Says what a change will reach before it lands: the project as it stands against the version that runs, or against a point or a branch that it names. It reads the descriptions alone, and never the code a second time.

## Usage

```
tent impact [<point>] [--data <folder>]
```

## Options

| Option | Means |
|---|---|
| `<point>` | A point or a branch of the history to hold the project against: a name, `now`, or the first 8 or more characters of an id. Left out, the version that the engine of the data folder runs, and the newest point where none runs |
| `--data <folder>` | The data folder of the engine to ask. Left out, it is `.tent/` of the project |

## Example

```
tent impact before-orders
```

## Output

What the change reaches, the weightiest part first, each part left out where it is empty: wider rights, breaks for callers outside with the callers of the last 30 days, data with how each table change lands and the rows it touches, work under way, what each changed definition reaches, the tests that touched each in their last run (`tent test` writes them into `.tent/touched.json`), and what now sends data out or asks a person no more. One line for each finding:

```
orders.total (column, number -> money, hard, 1500 rows)  tables/orders.ts  reaches 4 functions, 7 screens, 2 offered to the API
```

In a terminal of fewer than 30 lines the counts of each part come first. With `--json`:

```json
{ "ok": true, "value": { "against": "running", "rights": [], "breaks": [], "data": [{ "name": "orders.total", "kind": "column", "file": "tables/orders.ts", "change": "number -> money, hard, 1500 rows", "reaches": 11 }], "work": [], "reaches": [{ "name": "orders.total", "tree": [] }], "tests": [{ "name": "orders.total", "tests": [] }], "untested": [], "out": [] }, "findings": [] }
```

`tent publish` prints the same before it asks, and a publish whose impact holds wider rights or breaks for callers outside lands only with `--accept-impact` beside `--yes`. The impact of each publish is kept with its point, and `tent history compare` prints it beside what changed. The project tool `impact` answers the same to a model.

## Errors

`code.T9107` for a point that is none.

## See also

`command.publish`, `command.test`, `command.history`, `topic.commands`
