# `gpu` of `python`

Lets the Python program see the graphics cards of the computer.

## Value

True or false. False when left out.

## Example

```ts
export const churn = python('churn', {
  file: 'ml/churn.py',
  input: { team: link('teams') },
  output: object({ risk: number() }),
  access: role('staff'),
  gpu: true,
})
```

## See also

`word.python`
