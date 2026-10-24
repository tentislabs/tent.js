# `words` of `judge`

Other words for the request a judge is asked with, in place of the engine's own.

## Value

A text, which stands first in the request, before the task, the answer and the rule. Left out, the engine's own: that the model grades an answer, gives a score from 0 to 1 for how well it keeps the rule, and one sentence of reason.

## Example

```ts
with: judge(writer, 'Is kind to the customer', { words: 'You read letters to customers for a shop. Score each from 0 to 1, with one sentence of reason.' })
```

## See also

`word.judge`
