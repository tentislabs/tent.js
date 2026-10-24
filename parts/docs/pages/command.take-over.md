# `tent take-over`

Makes a reader the writer of what it holds, for a writer that is known to be stopped. It is for an engine that runs, and starts none.

## Usage

```
tent take-over [--yes] [--data <folder>]
```

## Options

| Option | Means |
|---|---|
| `--yes` | Take over. Left out, the command says what this machine knows and may lack, and changes nothing |
| `--data <folder>` | The data folder of the engine to ask. Left out, it is `.tent/` of the project |

## Example

```
tent take-over --data /srv/shop-reader --yes
```

## Output

With `--json`, what the machine knew before, and with `--yes` the epoch it began and the number of its last write:

```json
{ "ok": true, "value": { "role": "reader", "far": false, "n": 43, "epoch": "2.01m4ssp02ke8w7rr2pa9cq4d1x", "current": false, "lastBeat": 1791878460000, "notCurrentSince": 1791878466000, "others": [{ "id": "01m4ssq7h3f4tbm1x0n2r9c8ya", "far": true, "n": 41 }], "ahead": [], "fetching": 0, "took": true }, "findings": [] }
```

`notCurrentSince` is the moment from which the writer may have answered writes that this machine lacks: they stay on the old writer, which keeps them as a `lost` file when it comes back. `ahead` names each reader that holds more writes than this one. `fetching` is how many data files of tenants this machine is still fetching from its writer: a file that has not arrived holds writes that this machine lacks, and it asks for them from the writer until it holds the file. The machine is started without `--reads` from then on.

## Errors

`code.T0032` on a reader that is current: its writer runs, and is stopped first. `code.T0030` on the machine that is the writer. `code.T0029` on a reader that does not hold the whole data yet. `code.T0013` where no engine runs on the data folder.

## See also

`command.machines`, `command.start`, `adapter.Lease`
