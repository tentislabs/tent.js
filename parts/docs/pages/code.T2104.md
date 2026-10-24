# T2104 link-missing

A `link` value names a row that does not exist. A caller gets it with the status 400.

## Details

The store checks every link when it is written. A table change that would leave a link without its row is undone with this code too.

## The fix

Write the id of a row that is there. Add the row that the link points to first, in the same change where both are new.

## See also

`word.link`, `code.T2102`
