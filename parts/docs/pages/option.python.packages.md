# `packages` of `python`

The packages the code needs, which `tent python lock` locks and the engine installs into the environment of the lock.

## Value

A list of entries. An entry is the name of a package, with a version or a range where one is wanted, and with the standard's own two additions where they are wanted: a part in square brackets, and the mark of a system after a semicolon. `'pandas>=3'`, `'scikit-learn'`, `'uvicorn[standard]>=0.30, <1'` and `"pywin32; sys_platform == 'win32'"` are entries. An entry never holds an option, an address or a file: an index of your own goes into `python.index` of `project`. Left out, it needs none.

The entries of every `python` of the project are locked together into `python.lock`, or into the named lock of `option.python.lock`. After a change of an entry, run `tent python lock`: the build refuses a lock that was made from other entries.

## Example

```ts
export const churn = python('churn', {
  file: 'ml/churn.py',
  input: { team: link('teams') },
  output: object({ risk: number() }),
  access: role('staff'),
  packages: ['pandas>=3'],
})
```

## Errors

`code.T1014` for an entry that holds an option, an address or a file.

`code.T7020` when the lock was made from other entries.

## See also

`word.python`, `command.python`, `option.python.lock`, `option.project.python`
