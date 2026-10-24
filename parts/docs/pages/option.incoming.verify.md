# `verify` of `incoming`

How the signature of a call is checked.

## Value

The `signature` of a service that states `webhook`, or `{ scheme, secret }`. One of `verify` and `open` is required: neither is `code.T3008`, both `code.T1007`.

`scheme` is one of three names, or a record of the builder's own:

| Scheme | The signature | Its method | What is signed | The id of a call | Its time |
|---|---|---|---|---|---|
| `'standard'` | `webhook-signature`: entries with spaces between, `v1,<base64>` or `v1a,<base64>` | A secret `whsec_...`: HMAC with SHA-256, the key being the bytes in base64 after the prefix, `v1` entries only. A secret `whpk_...`: Ed25519 with that public key, `v1a` entries only. A secret with neither prefix is the base64 of an HMAC key | The id, a dot, the time, a dot, the body | `webhook-id` | `webhook-timestamp`, in seconds |
| `'stripe'` | `Stripe-Signature`: `t=<time>` and one or more `v1=<hex>` | HMAC with SHA-256, the key being the secret as its text | The time, a dot, the body | The `id` of the JSON body | `t` |
| `'github'` | `X-Hub-Signature-256`: `sha256=<hex>` | The same | The body | `X-GitHub-Delivery` | None |
| `{ header, encoding, prefix, id }` | The named header, in `'hex'` (the default) or `'base64'`, after `prefix` | The same | The body | The header that `id` names | None |
| `{ by: 'name' }` | A check of the builder's own, made in `engine.ts` under `verifiers` | It is handed the headers, the exact bytes, the secret and the time, and answers the id and the time where it has them, or throws | | What it answers | What it answers |

Of a signature, `limits.signatureEntries` (20) entries at most are looked at. A time more than `limits.incomingAge` (5 minutes) from now is refused.

## Example

```ts
export const formEvents = incoming('formEvents', {
  path: '/hooks/forms',
  verify: { scheme: 'standard', secret: secret('FORMS_HOOK') },
  then: formSent,
})
```

## See also

`word.incoming`, `option.service.webhook`, `code.T7118`
