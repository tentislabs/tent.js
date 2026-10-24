# T0002 bad-input

The input does not fit the declared types. A caller gets it with the status 400.

## Details

`fields` names each field that failed, by its dotted name, with the name of the check it failed. An entry of a list is named by its number: `lines.0.qty`.

| Check | The field |
|---|---|
| `required` | Is required and was not given. `null` means "not given" |
| `type` | Is of another type than was declared: a number where a text is, a number with a decimal part where a whole one is, a day that is no day of the calendar |
| `min`, `max` | Is under or over what its type states: the characters of a text, a number, the entries of a list |
| `pattern` | Is a text that does not fit the pattern of its type |
| `values` | Is none of the values of its `choice` |
| `kinds`, `maxSize` | Is a file of a kind that its type does not take, or one that is too large |
| `unknown` | Was not declared. An input never carries more than was declared |

## The fix

Send what the function declares as its `input`: every required field, each of its type, and no field more. In a form the fields are drawn from the same types, and each field shows what it failed.
