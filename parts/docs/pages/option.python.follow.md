# `follow` of `python`

Who may follow its runs from a page.

## Value

A rule, in the form of `access`. Left out, nobody.

## Example

```ts
export const churn = python('churn', {
  file: 'ml/churn.py',
  input: { team: link('teams') },
  output: object({ risk: number() }),
  access: role('staff'),
  follow: role('staff'),
})
```

## See also

`word.python`
