# `limits` of `service`

The limits of the calls of the service, counted for the service in the memory of the engine.

## Value

`{ perSecond, perMinute, atOnce, size, error, redirects, time }`, each optional.

| Limit | Means |
|---|---|
| `perSecond`, `perMinute` | How many calls may start in a second, and in a minute, a try again among them. One more waits its turn |
| `atOnce` | How many may be under way at once. One more waits for one to end |
| `time` | How long one try may take, to the end of its answer. 30 seconds when left out |
| `size` | The most one answer may hold. 10 MB when left out; a file that a call answers is held to the `maxSize` of its type |
| `error` | How much of the body of a failed answer is kept for code to read in `error.service`. 16 kB when left out |
| `redirects` | How many times an answer may send the call on. 3 when left out |

The wait for a turn is no part of `time`, and ends with the time of the function or the step the call is made in.

## Example

```ts
export const stripe = service('stripe', {
  url: 'https://api.stripe.com',
  limits: { perSecond: 20, perMinute: 600, atOnce: 4, size: '10 MB', error: '16 KB', redirects: 3, time: '20 seconds' },
})
```

## Errors

`code.T7115`: an answer that passes `time` or `size`.

## See also

`word.service`, `option.service.tries`
