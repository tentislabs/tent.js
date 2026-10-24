# T2016 shown-table-misused

A table that shows the counts or the scores of the engine is used in a way that is not for it. The check finds it, and a call that does it fails with it while it runs.

## Details

A table that states `shows: 'counts'` is the engine's own table of counts, and one that states `shows: 'scores'` its table of ratings and scores, under a name and a read rule of the builder's. It is read, and never written: ratings are kept through `rate`, and scores by the judge. These are not for it:

- columns, `owner`, `search`, `indexes`, `unique`, `tenant` and `keepHistory` stated on it, a rule to add, change or remove, and no `read` rule;
- a second table that shows the same: the counts, or the scores;
- a write of it, of any kind;
- `search`, `near` and `history` on it;
- a trigger on it: a flow that the counting set off would be counted itself.

A flow that works on the counts or the scores states a schedule and reads the table. The finding and the error name what the table shows.

## The fix

Read it with a filter, a sort, `limit`, `count` or `group`, and state `access: { read }` on it and nothing more. Keep what is made of the counts - rates, budgets, invoices - in a table of your own.

## See also

`option.table.shows`, `word.table`
