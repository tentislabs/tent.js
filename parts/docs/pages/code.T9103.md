# T9103 publish-refused

A server refused a push or a publish, and said why. Nothing on the server was changed.

## Details

| The reason, in `fields` | What happened |
|---|---|
| `pointer-moved` | Someone else pushed to the branch since this computer last saw it, and both changed one part of the app, or the two do not merge. `path` names the part |
| `check` | The two pushes changed other parts, and the merged project does not pass the check: a column renamed beside a new query that reads its old name |
| `pointer` | The push asked to move a name that the history keeps for itself: `live`, `now`, `on`, a name that starts `at:`, `seen:` or `made:`, or one with a slash, a colon or white space |
| `loose` | The server holds `syncLooseSize` of bytes that no point names, until its daily upkeep has run |
| `rows`, `secret`, `health`, `waiting`, `busy`, `nothing` | Of a publish: rows that do not fit a table change, a secret with no value, a version that failed its health check, a run that waits on a hard publish, another publish under way, or nothing to go back to |
| `impact` | Of a publish: its impact holds wider rights or breaks for callers outside, and it was not accepted with `--accept-impact`. Nothing was sent to be switched to |

A caller is sent the reason and its count in `fields`.

## The fix

For a push: `tent pull`, which merges the other side's work into your files and writes what clashes into `tent.clash.ts`, then settle and push again. For a publish: mend what the reason names, and publish again.

## See also

`command.push`, `command.pull`, `topic.history`
