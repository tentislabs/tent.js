# T2107 value-not-valid

A value that code writes does not fit its column.

## Details

`fields` names the column. The cases: a value of another type than the column holds, a number that is not finite, a value that is none of the values of a `choice`, nothing for a required column, and a name that is no column of the table. `null` clears an optional column, and is refused for a required one.

## The fix

Write a value of the column's type. Where the column may hold nothing, state `optional: true` on it.

## See also

`topic.types`, `word.table`
