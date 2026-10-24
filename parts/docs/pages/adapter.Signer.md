# `Signer`

An auth of the builder's own for a service: a function that is handed the finished request of a call and answers the request that is sent. A service names it with `auth: { by: '<name>' }`, for a provider that wants a signed request or a token made from a key file.

## Interface

```ts
type Signer = (request: Request, o: { service: string; user?: string }) => Request | Promise<Request>
```

It is made in `signers` of the makers in `engine.ts`, by the name the service gives, and declared in `tentjs/connect`, which `tentjs/engine` gives again. It runs last, after the lines of the service and the once-only key of a step, and once for each try, so a signature that holds a time is made anew each time. The request it is handed can be read more than once: `request.clone().text()` reads the body. `user` is the id of the user the call runs as, where it runs as one. An error in it fails the call with T0009, and the call is not tried again. A name that nobody made stops the app from opening (T7113). The service keeps its limits, its tries, its row of the log and its fake in tests.

## Example

```ts
// services/vault.ts
export const vault = service('vault', { url: 'https://vault.example.com', auth: { by: 'signed' }, calls: { read: get('/read', { input: {} }) } })

// engine.ts
import { createHmac } from 'node:crypto'
import type { Makers, Signer } from 'tentjs/engine'
export default {
  signers: ({ secrets }) => ({
    signed: (async (request) => {
      const made = new Request(request)
      const body = await request.clone().text()
      made.headers.set('X-Signature', createHmac('sha256', secrets.VAULT_KEY.reveal()).update(body).digest('hex'))
      return made
    }) satisfies Signer,
  }),
} satisfies Makers
```

## See also

`adapter.Verifier`, `option.service.auth`, `code.T7113`
