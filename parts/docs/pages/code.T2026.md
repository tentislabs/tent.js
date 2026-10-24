# T2026 findable-sealed-misused

A sort or a range filter is asked of a column that is sealed and findable: its fingerprint answers an equal value alone.

## Details

A sealed column with `sealed: { findable: true }` keeps beside its value a keyed fingerprint, by which a filter of an equal value finds the row with nothing opened: `where({ email: x })`, an `in` of a list, and a `not` of one value. A fingerprint has no order and tells nothing of the value, so the check reports a plan that sorts by such a column or asks it `above`, `below`, `before`, `after`, `startsWith`, `contains` and the like; a plan that code makes with `db` is refused with this code while the app runs.

## The fix

Find the row by an equal value, and sort or compare by a column that is not sealed.

## See also

`topic.types`, `code.T2011`
