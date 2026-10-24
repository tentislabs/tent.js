# T7115 service-failed

A call of a service failed: the service answered with a status of 400 or more, also after its tries, no answer came, or the answer passed `limits.time` or `limits.size` of the service.

## Details

The error carries what the service answered, for code to read: `error.service` is `{ status, body }`, the status when there was one, and the body as JSON or as text, up to `limits.error` of the service (16 kB). Every secret of the app is taken out of that body before it is kept anywhere, so a key that the service echoes back is `[secret]` there. A caller of the app is sent the code and its general sentence, and nothing of `service`.

A call is tried again only where that is safe: a call that states `changes: false`, a `get`, and a call that carries a once-only key, which a call inside a step of a flow does where its service names `onceOnlyHeader`. A step of a flow tries this code again like any failure, also for a status of the caller's own side: code that minds reads `error.service.status`.

```ts
try {
  await stripe.createRefund({ charge })
} catch (error) {
  if (error.code === 'T7115' && error.service?.status === 404) fail('no-such-charge', 'That charge is not there.')
  throw error
}
```

## The fix

Read `error.service` to see what the service said. A status that is yours to tell, as a 404, is answered with your own `fail`. A service that answers slowly is given more time with `limits: { time }`, and a large answer more room with `limits: { size }`.

## See also

`word.service`, `option.service.limits`, `option.service.tries`, `code.T7116`
