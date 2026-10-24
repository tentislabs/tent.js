# T7113 provider-missing

A definition names something of the builder's own that nobody made in `engine.ts`, so the app does not open: a model's provider, a service's auth (`auth: { by }`), or a check of a signature (`scheme: { by }`).

## Details

An auth of your own is made in `signers` of the makers, and a check of a signature in `verifiers`, each by the name that the definition gives. A program that holds the engine may make them too, in `createEngine({ makers })`. The engine looks for every name when the app opens, so a name that is wrong is found then, and never on a call.

## The fix

Make the thing in `engine.ts`, under the name the definition gives, or correct the name in the definition.

```ts
// engine.ts
import type { Makers } from 'tentjs/engine'
export default {
  signers: ({ secrets }) => ({ signed: (request) => sign(request, secrets.KEY.reveal()) }),
} satisfies Makers
```

## See also

`adapter.Provider`, `adapter.Signer`, `adapter.Verifier`, `option.service.auth`
