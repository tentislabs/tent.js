# T0027 cannot-work-out

A value word was handed a value of another kind than it works with. The error names the word and the value.

## Details

| The value | Where |
|---|---|
| A length of time that does not read, or one below zero | `word.later`, `word.earlier` |
| A unit a day does not have, as hours | `word.later`, `word.earlier`, `word.between` |
| A moment and a day together | `word.between` |
| A zone the runtime does not know | `word.dayOf` |
| A day or a moment that would lie outside the calendar, which runs from `0001-01-01` to `9999-12-31` | `word.later`, `word.earlier`, `word.dayOf` |
| A step of zero | `word.range` |
| Nothing where a list is needed, and an entry of another kind | `word.sum`, `word.avg`, `word.min`, `word.max`, `word.join`, `word.each`, `word.where` |
| A number where a text is needed, and a text where a number is | The words for text and for numbers |
| A list or a text that one word would make larger than the limit `valueSize`, which is 1,000,000 unless `limits` of the project says otherwise | Every word that makes one |

A length of time that is written in a definition and does not read is found when the project is described, as T1011.

## The fix

Hand the word the kind of value it works with. A value that may be missing is tested first, or is handed to a word that lets nothing pass: `later`, `earlier`, `between` and `dayOf` answer nothing for nothing.

## See also

`topic.values`
