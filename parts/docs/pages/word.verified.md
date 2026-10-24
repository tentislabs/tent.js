# `verified`

Checks the signature of the request of a route over the exact bytes that arrived, also after the route read the body.

## Example

```ts
const { id, body } = await verified(request, stripe.signature)
```

It is for an exchange that is more than "start a flow": a provider that expects an answer of its own. Its second argument is what `verify` of an `incoming` takes. It notes no id by itself: `verified(request, signature, { once: true })` notes it as an `incoming` does.

## Returns

A promise of `{ id, body }`: the id of the call where its scheme has one, and its bytes. With `once`, a repeat answers `{ id, body, seen: true }`.

## Errors

`code.T7118` for a signature that does not hold. `code.T0013` in a route whose file does not import `verified`: the engine keeps the bytes only for such a route. `code.T0010`: it was called with no engine: nothing stands in the runtime slot.

## See also

`handle.verified`, `word.route`, `word.incoming`
