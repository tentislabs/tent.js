# `refresh` of `read`

How often an action that a screen reads is asked again while the screen is shown.

## Value

A length of time, as `'10 minutes'`. A query states its own, and follows its rows live. Left out, an action is asked once.

## Example

```tsx
data: { rates: read(currencyRates, { base: 'USD' }, { refresh: '10 minutes' }) },
```

## Errors

`code.T1011`: `refresh` is no length of time.

## See also

`word.read`, `topic.live`
