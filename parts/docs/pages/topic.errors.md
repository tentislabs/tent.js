# Errors

Every failure is a `TentError`, which is exported from `tentjs`. A query or a change throws it, and a failed action refuses its promise with it.

| Member | Holds |
|---|---|
| `code` | For the framework, `T` and four digits, as `T0002`. For an error of an app's own, the builder's word |
| `name` | The short word of the code, as `bad-input`. For an error of an app's own, the builder's word again |
| `message` | What went wrong, in words |
| `fix` | What to do about it, where that can be said |
| `where` | `{ file, line, definition }`: the place in the project, where there is one |
| `fields` | For each field that failed, by its dotted name, what it failed. An entry of a list is named by its number, as `lines.0.qty` |

```ts
import { TentError } from 'tentjs'

try {
  await refund({ order })
} catch (error) {
  if (error instanceof TentError && error.code === 'T2103') {
    // the order is not there
  }
}
```

Every code of the framework has a page: `tent docs T0002`.

What the build and the check report is a finding: the same members, with `level`, which is `'error'`, `'warning'` or `'note'`, and `docs`, the command that explains its code.
