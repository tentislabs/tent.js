# T2101 not-unique

A write breaks a `unique` rule: a row with the same values in those columns is already there. A caller gets it with the status 409.

## Details

`fields` names each column of the rule that was broken. Two rows that hold nothing in such a column do not break it.

## The fix

Read the row that is there first, and change it in place of adding a second one. Where two rows may hold the same value, take the column out of `unique`.

## See also

`word.table`, `topic.errors`
