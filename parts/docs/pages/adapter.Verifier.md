# `Verifier`

A check of a signature of the builder's own, for a call coming in: a function that is handed the headers, the exact bytes of the body, the secret and the time, and answers the id and the time of the call where it has them. A scheme names it with `{ by: '<name>' }`, in `verify` of an `incoming` and in `webhook` of a service.

## Interface

```ts
type Verifier = (o: { headers: Headers; body: Uint8Array; secret: string; now: number }) =>
  { id?: string; time?: number } | Promise<{ id?: string; time?: number }>
```

It is made in `verifiers` of the makers in `engine.ts`, by the name the scheme gives, and declared in `tentjs/connect`, which `tentjs/engine` gives again. It throws where the signature does not hold, and the call is refused with T7118. The engine remembers the id it answers, so a repeat of the call starts no second run, and holds the time to `limits.incomingAge`, as for a scheme of its own. A name that nobody made stops the app from opening (T7113).

## Example

```ts
// engine.ts
import type { Makers, Verifier } from 'tentjs/engine'
export default {
  verifiers: () => ({
    partner: (({ headers, secret }) => {
      if (headers.get('x-partner-key') !== secret) throw new Error('The call is not from the partner.')
      return { id: headers.get('x-partner-id') ?? undefined }
    }) satisfies Verifier,
  }),
} satisfies Makers
```

## See also

`adapter.Signer`, `word.incoming`, `code.T7113`
