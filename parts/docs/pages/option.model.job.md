# `job` of `model`

Makes the model a long job that is asked about until it is done.

## Value

`{ check, with, done, failed, every }`. Left out, the call answers at once.

## Example

```ts
export const writer = model('writer', {
  provider: 'service',
  name: 'claude-sonnet-5-5',
  job: { check: hooks.status, with: { id: 'id' }, done: { status: 'succeeded' }, failed: { status: 'failed' }, every: '5 seconds' },
})
```

## See also

`word.model`
