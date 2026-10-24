# T2102 link-in-use

A row cannot be removed because other rows link to it. A caller gets it with the status 409.

## Details

A `link` column says with `onRemove` what happens to its rows when the row they point to is removed. Where it says nothing, or `'refuse'`, the removal is refused while one such row is left.

## The fix

Remove the rows that link to it first, or state `onRemove: 'remove'` or `onRemove: 'clear'` on the link column.

## See also

`word.link`, `option.link.onRemove`
