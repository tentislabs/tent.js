# `sampleOf`

A valid value of a type, the one sample that `app.make`, `tent test --plan` and `tent test --declared` all take.

## Example

```ts
import { sampleOf } from 'tentjs/test'

sampleOf({ kind: 'text', min: 3 }, 'title')              // 'A title'
sampleOf({ kind: 'choice', values: ['open', 'paid'] }, 'state')   // 'open'
```

## Options

| Option | Means |
|---|---|
| `option.sampleOf.linked` | What makes a row for a link, and answers its id. |
| `option.sampleOf.n` | The number of the row a sample is made for. |

## Returns

A value of the type, as the description stores it: a text of its own, as long as its least and no longer than its most, `A <name>`, or `<name> <n>` for the row `n` that `app.make` makes; a number its least, or 1 where none is stated; `false`; the moment and the day that run; the first of the values of a choice, as `values` of the description keeps them; an empty list, or its least of samples of what it holds; and a record of a sample of each field that must be there. A link answers a promise of the id of a row, which `linked` makes.

## Errors

`code.T0002`: a kind of which no sample is made, as a file.

## See also

`word.testApp`, `word.declared`, `command.test`
