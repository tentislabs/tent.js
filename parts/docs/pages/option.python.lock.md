# `lock` of `python`

A lock of its own, for packages that cannot share the lock of the project.

## Value

A name: `'old'` is locked into `python.old.lock`, beside `python.lock` in the root of the project, and gets an environment of its own. Two definitions that need two versions of one package cannot share a lock: `tent python lock` says so, naming both, and one of them states a `lock` of its own. A named lock is made for the Python of `python.locks.<name>.version` of `project`, or for that of the project. Left out, the lock of the project holds.

## Example

```ts
export const churn = python('churn', {
  file: 'ml/churn.py',
  input: { team: link('teams') },
  output: object({ risk: number() }),
  access: role('staff'),
  lock: 'old',
})
```

## Errors

`code.T7020` when the named lock is not there, or was made from other entries of `packages`.

## See also

`word.python`, `command.python`, `option.project.python`
