# `declared`

Runs the cases that are made from what the app declares, each a test of its own, in a test file: what `tent test --declared` runs.

## Example

```ts
// tests/declared.test.ts: the cases beside the tests written by hand
import { declared } from 'tentjs/test'

await declared()
```

## Options

| Option | Means |
|---|---|
| `option.declared.update` | Whether the table of access is kept anew. |

## Returns

A promise, once each case is a test of the runner, in the order of the names of the definitions, each named by its line: `refundOrder - access: role('staff'): as a user with no role, refused T3101 (needs role 'staff')`, `priced.price - number({ min: 0, max: 100 }): 0, taken`. The cases are what each caller gets of each function, offered flow and table, held to `tests/declared/access.json` as a kept picture is held; each field of each input at the edges of its type; and each form of each screen, sent empty, with a sample and with its edges. A case starts from one mark of the data, and reaches nothing outside: every service and model refuses with `code.T7132`, a plain `fetch` is held, and a run that asks a person is answered no. `topic.tests.declared` tells all of it.

## Errors

A case of an edge whose code fails as internal, `code.T0009`, fails its test, with the definition, the line of its source, and the smallest input that still fails.

## See also

`topic.tests.declared`, `command.test`, `word.sampleOf`, `code.T7132`
