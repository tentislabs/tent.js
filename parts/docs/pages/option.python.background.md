# `background` of `python`

Runs it off the main thread.

## Value

`true`, or `'here'` for a thread of this program always. False when left out.

## Example

```ts
export const churn = python('churn', {
  file: 'ml/churn.py',
  input: { team: link('teams') },
  output: object({ risk: number() }),
  access: role('staff'),
  background: 'here',
})
```

## See also

`word.python`
