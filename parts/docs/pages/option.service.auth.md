# `auth` of `service`

How each request of the service says who it is from. The engine puts it on each request, and opens a secret there: no code of the app holds its value.

## Value

One of these forms. A value is `secret('NAME')` or a literal text. Left out, nothing is added.

| Form | Is put on the request as |
|---|---|
| `{ bearer: value }` | `Authorization: Bearer <value>` |
| `{ header: { name, value } }` | A line of that name |
| `{ basic: { user, password } }` | The standard line of a name and a password |
| `{ query: { name, value } }` | One more name after the question mark of the address |
| `{ oauth: { ... } }` | The connection of the user the call runs as |
| `{ by: 'name' }` | An auth of your own, made in `signers` of `engine.ts`, which is handed the finished request and answers the one that is sent |

A redirect to another host carries no line of an auth, whatever its name.

## Example

```ts
export const stripe = service('stripe', {
  url: 'https://api.stripe.com',
  auth: { bearer: secret('STRIPE_KEY') },
})
```

## Errors

`code.T1014`: a value that is none of the six forms, or a form with a name it does not take. `code.T0019`: a secret that a call needs has no value. `code.T7113`: a form `by` that nobody made, which stops the app from opening.

## See also

`word.service`, `adapter.Signer`
