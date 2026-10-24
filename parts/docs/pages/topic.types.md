# The types

One set of twelve types is used for the columns of a table, for inputs and outputs, for the checking of a form, for the API description, for MCP tools and for the answers of an AI.

```ts
text(o?)
number(o?)
boolean(o?)
date(o?)      // a moment in time
day(o?)       // a calendar day with no time and no zone
choice(values, o?)
link(tableName, o?)
file(o?)
list(type, o?)
object(shape, o?)
json(o?)
vector(o)     // numbers for search by meaning
```

Each has a page of its own, as `word.text`, and so has each option of one, as `option.text.min`.

## The options every type takes

| Option | Means |
|---|---|
| `optional` | True for a value that may be left out. A value is required when it is left out |
| `default` | The value that stands in for one that was not given. On a `date`, `'now'` is the moment; on a `day`, `'today'` is the day. A `vector` takes none |
| `label` | The words a form shows beside the field: text, or a `message(...)` of the language files |
| `help` | The words a form shows under the field: text, or a `message(...)` of the language files |

## The options a column also takes

| Option | Means |
|---|---|
| `unique` | No two rows hold the same value |
| `index` | The column is indexed |
| `private` | The value never leaves the server in a row: the `read` rule of the column that no caller passes, held by its paths below. A `private` column states no `search` |
| `personal` | The value is data about a person |
| `sealed` | The value is stored encrypted. `sealed: { findable: true }` keeps beside it a keyed fingerprint of the value, bound to the table and the column, so a filter of an equal value finds the row with nothing opened, and the same value in another column does not match. A sort and a range on it are `code.T2026` |
| `read` | Who may read the column: a rule, as the rules of a table are written, as `read: role('hr')`. A caller the rule does not let in gets each row without the column, also through a link, in a live answer and on a page, and a row that code with full access read loses it again where it leaves through a typed answer, a field of a group too; is refused a filter, a sort and a group by it (`code.T0013`); a search and a `near` are answered over the other columns, the column left out of what is matched, and a `near` by the column itself finds no row; and a group answers no value worked out from it. A rule that is a filter, as `where({ manager: caller('id') })`, lets the caller read the column of each row it fits. Code with full access reads it. In the description of the API, an MCP tool and the line of a tool the field is optional, and the line says who reads it, as `salary?: number (read by hr)`. A kept count stands under the rule of its own row: a builder who must hide it states `read` on it |
| `from` | The value is worked out from the row's own columns, or kept from the rows that link to its row: `count`, `sum`, `min` and `max` handed `{ of, by, where, column }`, as `number({ from: count({ of: orders, by: 'customer' }) })` (`word.count`) |
| `was` | The column's old name, or a list of them, where it was renamed |
| `by` | The work that fills the column: an action, a `python` or a model, as `by: summarize` or `by: { work, input, take }`. On a vector column that states its model: the columns whose words are turned into the vector, as `by: 'body'` |
| `old` | On a column that states `by`, and on a vector column: `'drop'` or `'keep'`, what becomes of the values it holds when its work or its model changes |

A `vector` column takes neither `unique` nor `index`, and is always optional.

## Values in code

| Type | In TypeScript |
|---|---|
| `text`, `day`, `file`, `link` | `string`. A day is `'2026-10-08'`. A file and a link are ids |
| `number` | `number` |
| `boolean` | `boolean` |
| `date` | `Date` in backend code. On the wire it is text in the standard form |
| `choice` | The union of its values |
| `list`, `object` | A list and an object of the inner types |
| `json` | `unknown` |
| `vector` | `number[]` |

A value that is not there is left out: an optional input that was not given is not in `input`. Given as an input, `null` means "not given". Inside a `json` value, `null` is kept as it is.

Two types of TypeScript say what a type means in code. `Handed<typeof type>` is what code is handed for a value of the type: a value that has a default is there, and a moment is a `Date`. `Given<typeof type>` is what a caller gives: a value that is optional or has a default may be left out, and a moment is a `Date` or text.

## When a value does not fit

A value that does not fit its type is refused, and the error names each field that failed by its dotted name, with the name of the check it failed: see `tent docs T0002`.
