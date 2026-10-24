# T1002 name-mismatch

The exported name and the stated name of a definition differ. A definition is a top-level `export const`, made with a literal name as its first argument, and the two names must be the same.

## The fix

Give the export and the definition one name: `export const openOrders = query('openOrders', { ... })`.

## See also

`topic.words`
