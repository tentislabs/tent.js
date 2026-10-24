# T9101 point-not-usable

A point was to be merged from, merged into, pushed or published, and it cannot be: it did not pass the check on this computer, or it is a merge whose clashes are not settled. Nothing was changed.

## Details

| The case | What it names |
|---|---|
| `tent history merge`, `tent push` or `tent pull` of a point that was built and checked here and did not pass | The point |
| A point of a merge with clashes, marked unsettled, while `tent.clash.ts` still holds what was left | The point |
| `tent publish` of files that do not pass the check: a publish checks what it builds, whatever the point says of itself | The point, and the findings |

A point that came from another computer holds no word of the check: before a push or a merge the command builds and checks the head itself, and marks it.

A caller is sent the point in `fields`, under `point`.

## The fix

Mend what the check finds and save, then try again. To share work that does not pass yet, type `--unchecked` with `tent push` or `tent history merge`: the point stays marked as it is, and it is still never published. Settle the clashes of a merge with `tent history merge --settle`.

## See also

`command.history`, `topic.history`
