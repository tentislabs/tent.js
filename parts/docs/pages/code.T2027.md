# T2027 link-to-memory

A table links to a table kept in memory, whose rows go by themselves: by one link, or by a list of links.

## Details

The rows of a table that states `kept: 'memory'` live in the writer's memory alone and are gone `lasts` after their last write, and when the program stops (`option.table.kept`). A link to such a row would point at nothing soon after it was written. The check reports each such link at its table.

## The fix

Link the other way: a row of memory may link to a row that stays, as a presence to its user. Or keep the rows in a table that stays.

## See also

`option.table.kept`
