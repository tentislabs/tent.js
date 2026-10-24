# T2011 sealed-misused

A `sealed` column is used where the store would have to read it: in a filter, a sort, a group, an index, `search` or `unique`, or in a `from`.

## Details

A sealed value is stored encrypted, so the store cannot compare it, order by it or look it up. The check finds a plan of a definition that does so. A filter, a sort and a group that code makes with `db` are refused with this code while the app runs.

## The fix

To find a row by a sealed value, state `sealed: { findable: true }` on its column: a filter of an equal value is then asked of a keyed fingerprint that the engine keeps beside it (`topic.types`). A sort and a range stay refused, with `code.T2026`.

## See also

`word.fingerprint`, `topic.types`, `code.T2026`
