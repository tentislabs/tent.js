# T6007 path-used-twice

Two definitions have one address: their paths fit exactly the same addresses, so one of the two could never be reached. It is two screens, two routes of one method, a route that states `GET` and a screen, two calls coming in, or a call coming in and a route that states `POST`.

## Details

The name of a value of the address does not tell two paths apart: `/orders/:id` and `/orders/:name` fit the same addresses. The finding stands at the definition that is written later, and names the first.

Two paths that only overlap are no finding: of `/orders/new`, `/orders/:id` and `/orders/*` the more exact one is tried first.

## The fix

Give one of the two another `path`, or the route another `method`.

## See also

`option.screen.path`, `word.screen`, `word.route`, `word.incoming`, `topic.engine`
