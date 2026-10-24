# `verified`

The handle behind the word `verified`: it checks the signature of the request of a route, over the exact bytes that arrived.

## Example

```ts
import { anyone, route, verified } from 'tentjs'
import { stripe } from '../services/stripe'

export const exchange = route('exchange', {
  method: 'POST',
  path: '/exchange',
  access: anyone('the provider posts here, and signs what it posts'),
  run: async ({ request }) => {
    const { id, seen } = await verified(request, stripe.signature, { once: true })
    return seen ? Response.json({ again: id }) : Response.json({ taken: id })
  },
})
```

## Members

| Member | Does |
|---|---|
| `check(request, signature, { once })` | What `verified` calls. It checks the signature by the scheme of `signature`, which is what `verify` of an `incoming` takes, and answers `{ id, body }`. With `once` it notes the id as an `incoming` does, and answers `{ id, body, seen: true }` for a repeat |

The engine keeps the bytes of a request, up to the `size` of the route, only for a route whose file imports `verified`: the build records it for the route. So the check works after the route read the body, and a route that takes a large upload keeps nothing.

## Errors

`code.T7118` for a signature that does not hold, or a time too far from now. `code.T0013` in a route whose file does not import `verified`. `code.T0009` for a secret with no value.

## See also

`word.verified`, `word.incoming`
