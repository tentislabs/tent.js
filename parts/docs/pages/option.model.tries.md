# `tries` of `model`

How often the same model is tried in all before the next one.

## Value

A number, or `{ max, wait }`. 2 when left out.

## Example

```ts
export const writer = model('writer', {
  provider: 'service',
  name: 'claude-sonnet-5-5',
  tries: { max: 2, wait: '5 seconds' },
})
```

## See also

`word.model`
