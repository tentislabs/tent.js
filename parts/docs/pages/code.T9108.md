# T9108 not-gradual

A publish asked to go gradually, and its version cannot: both versions of a release run on one data, and its table change is hard, so the version that runs could not go on reading or writing its tables. Nothing was switched.

## Details

| The change | Why it cannot go gradually |
|---|---|
| A rename of a table or a column, a removed column or table (`renameColumn`, `retireColumn`, `renameTable`, `retireTable`) | The version that runs reads it under its old name, or at all |
| A column that becomes required, a new `unique`, a type that is checked against the rows or rebuilds the table | The rows would be held to a rule that the version that runs does not keep |

The message names each step of the change. An added column, an added table and a widened type go gradually.

## The fix

Publish the version whole, with `tent publish` and no `--gradual`. Or cut the change in two: add what the version that runs does not read in one release, and remove the old in a later one.

## See also

`command.publish`, `option.project.release`
