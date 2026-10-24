# `limits` of `python`

The limits of a call.

## Value

`{ time, memory, load }` beside those of an action. `time`, 30 seconds where it is left out, is how long the call may take: past it the Python program is ended and the call is `code.T0008`, and the next call starts a new one. `memory`, 1 GB, is what the call may add to what its Python program held when it began: past it the program is ended and the call is `code.T7119`, which names the limit. `load` is how long the first loading of the file of the definition may take, which does not count on the time of the call: 2 minutes, by `limits.pythonLoad` of the project, where it is left out. Neither does the making of the environment of the lock count on the time of a first call.

## Example

```ts
export const churn = python('churn', {
  file: 'ml/churn.py',
  input: { team: link('teams') },
  output: object({ risk: number() }),
  access: role('staff'),
  limits: { time: '30 seconds', memory: '1 GB', load: '2 minutes' },
})
```

## See also

`word.python`
