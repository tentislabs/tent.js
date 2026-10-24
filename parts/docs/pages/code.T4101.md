# T4101 query-not-pure

A query read a clock, drew a random number or reached the network while it ran.

## Details

A query answers the same for the same data: that is what lets a page watch it. While the `run` of a query runs, and while the arrow of a rule runs, the engine swaps the clock, the random source and `fetch` of the runtime for ones that fail with this code: `Date.now()`, `new Date()` with nothing handed, `Math.random()`, the random bytes and ids of `crypto`, and `fetch`. `random()` and `token()` fail the same way there, in a body that was read too. A moment that is made from a number, a text or its parts is no clock, and works. The check finds most of these before the app runs (`code.T4001`, `code.T4002`, `code.T4003`).

## The fix

Read the time from the `now` that the query is handed. Draw and reach out in an action, or in a change where the value must be kept, and hand the query what it needs as its input.

## See also

`code.T4001`, `code.T4002`, `code.T4003`, `word.now`, `word.query`
