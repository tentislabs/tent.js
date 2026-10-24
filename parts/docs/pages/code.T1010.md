# T1010 not-plain

Something stands where only what can be read as text may stand: in a definition that states `plain: true` and holds what makes it code.

## Details

For a definition that states `plain: true`, the finding stands on the line of the first thing that makes it code, and names that thing: a `let`, a call of a function of the file's own, a method of a text or a list, and the rest of what a body may not hold.

## The fix

Write it with our words alone: a value word in place of a method, a query or a change in place of a helper function. Or let it be code: take `plain: true` away.

## See also

`option.query.plain`, `topic.values`, `topic.build`
