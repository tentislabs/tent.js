# `tries` of `service`

How often a call of the service is tried in all, the first try among them.

## Value

A number, 3 when left out. Or `{ max, wait, on, first }`: `max` the tries in all; `wait` the longest pause the service may ask for with `Retry-After`, 30 seconds when left out; `on` a list of more statuses that are tried again; `first` the pause before the second try, 1 second when left out, which grows four times with each try.

A try that got no answer, and the status 429, 502, 503 or 504 or one that `on` names, is tried again only where that is safe: the call states `changes: false`, is a `get`, or carries a once-only key, which a call inside a step of a flow does where the service names `onceOnlyHeader`. Before the next try it waits as long as the service asks, as seconds or as a date, where that is no longer than `wait`; a longer ask ends the call at once.

## Example

```ts
export const stripe = service('stripe', {
  url: 'https://api.stripe.com',
  tries: { max: 3, wait: '30 seconds', on: [409], first: '1 second' },
})
```

## Errors

`code.T7115`: the call failed after its tries.

## See also

`word.service`, `option.service.onceOnlyHeader`
