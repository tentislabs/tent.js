# T8000 type-error

The type checker found something in the project. The finding holds the checker's own number and its words, as `TS2322: Type 'string' is not assignable to type 'number'.`, with the file and the line.

## Details

`tent check` writes the type list of the project, `tent.d.ts`, anew before it starts the type checker, so that `db.orders` and a setting are typed from the definitions as they stand.

## The fix

Mend what the type checker names. Where the same mistake has a code of its own, as an unknown option (`code.T1003`) or an `async` `run` on a query (`code.T4005`), that finding says the fix.

## See also

`topic.check`, `topic.types`
