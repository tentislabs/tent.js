# `files` of `python`

More files of the project that the code works with, which go into the bundle beside the `.py` files, at their own paths.

## Value

A list of paths and patterns, from the folder of the project: `*` stands for any part of one name, and `**` for any folders, as `['ml/*.joblib', 'data/**/*.csv']`. Left out, only the `.py` files are copied.

Every `.py` file of the project is copied into the bundle by itself, under `python/` at its own path, so one file may import another: `ml/churn.py` writes `from ml import util`. A `.py` file of a folder that `roots` of `project` names lies under `python/roots/<its place in the list>/`. Left out are `.tent/` and `tests/` in the root, and wherever they stand `node_modules/`, `venv/`, `__pycache__/`, every folder whose name starts with a dot, and every file that is a link. `files` brings in what these leave out: a name or a pattern of `files` is copied also where it stands in such a folder, and a link that it names is copied where what it leads to lies inside the project or a root. The description holds the fingerprint of each file.

## Example

```ts
export const churn = python('churn', {
  file: 'ml/churn.py',
  input: { team: link('teams') },
  output: object({ risk: number() }),
  access: role('staff'),
  files: ['ml/*.joblib'],
})
```

## Errors

`code.T1014` when a file it names lies outside the folder of the project and of its roots, also after every link is followed.

## See also

`word.python`, `option.python.file`
