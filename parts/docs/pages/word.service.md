# `service`

An outside service that the app calls: its address, its auth and its calls. Each call is a function of the definition, which code calls as `await stripe.createRefund({ charge })`. It is always plain.

## Example

```ts
import { file, get, object, post, secret, service, text } from 'tentjs'

export const stripe = service('stripe', {
  url: 'https://api.stripe.com',
  auth: { bearer: secret('STRIPE_KEY') },
  headers: { 'Stripe-Version': '2026-06-30' },
  calls: {
    createRefund: post('/v1/refunds', { input: { charge: text() }, output: object({ id: text() }), body: 'form' }),
    invoicePdf: get('/v1/invoices/{id}/pdf', { input: { id: text() }, output: file({ maxSize: '20 MB' }) }),
  },
  limits: { perSecond: 20, time: '20 seconds' },
  onceOnlyHeader: 'Idempotency-Key',
})

// In an action, a route or a step of a flow:
const refund = await stripe.createRefund({ charge: 'ch_1' })
```

`mail` and `files` are the names of handles, and with every name that starts with `_t_` they are the framework's own (`code.T1009`): a service of mail is named `mailbox`.

## Options

| Option | Means |
|---|---|
| `option.service.url` | Where the service is. |
| `option.service.auth` | How each request says who it is from. |
| `option.service.headers` | Lines that every request of the service carries. |
| `option.service.calls` | The calls of the service. |
| `option.service.from` | A published description that the calls are read from. |
| `option.service.use` | The calls of the published description that are used. |
| `option.service.limits` | The limits of the service. |
| `option.service.tries` | How often a call is tried in all. |
| `option.service.onceOnlyHeader` | The header in which the service takes a once-only key. |
| `option.service.webhook` | How the service signs what it sends. |
| `option.service.connection` | Another service whose connection this one uses. |
| `option.service.mcp` | Marks the service as an outside MCP server. |
| `option.service.was` | The old name of the service, where it was renamed. |

A call goes step by step: its input is checked against the types of the call; the request is built, with the lines of `headers` and the auth, whose secret the engine opens and no code of the app ever holds; inside a step of a flow the once-only key is put into the header `onceOnlyHeader` names; the call waits its turn under `limits`; it is sent through the guarded fetch, with the time and the size of the service; a try that got no answer, or the status 429, 502, 503 or 504, is tried again where that is safe; the answer is read; and one row of `outgoing` is written to the log, with the service, the call, the status and the time, and no address and no header.

A call may be made in an action, a route and a step of a flow. In a query and a change it is T0013. Inside an action that a screen reads as an entry of its `data`, only a call that states `changes: false`, or a `get`, may be made. In a test a service that was not faked fails its calls with T7115: `app.fake` stands in for it.

## Returns

The definition, with one function for each call, which takes the input and `{ account, for }` and answers a promise, and `signature`, by which an incoming call is checked. A call with a stated `output` answers what the type names; with `output: file()` the id of a loose file of the caller; with none, the answer as JSON where it says it is JSON, and as text otherwise.

## Errors

`code.T0002`: the input does not fit the types of the call. `code.T7115`: the service failed, also after its tries. `code.T7116`: the answer does not fit `output`. `code.T0019`: a secret of the auth has no value. `code.T0022`: the guarded fetch refused the address. `code.T0013`: a call in a query or a change. `code.T0010`: it was called with no engine: nothing stands in the runtime slot.

## See also

`topic.words`, `word.post`, `word.get`, `topic.fetch`
