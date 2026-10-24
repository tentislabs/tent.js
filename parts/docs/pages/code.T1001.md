# T1001 not-top-level

A word that makes a definition is called where no top-level `export const` takes what it makes. The build finds a definition by its export, so one that is made inside a function, kept in a `const` that is not exported, or exported in another way is no definition of the project.

## The fix

Write the definition at the top of its file, as `export const openOrders = query('openOrders', { ... })`. A definition that only other definitions use is exported all the same: its access rule says who may call it.

## See also

`code.T1002`, `code.T1006`, `topic.build`
