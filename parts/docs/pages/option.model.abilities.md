# `abilities` of `model`

Which fixed calls the model has, for a model the list does not know.

## Value

A list of `'reply'`, `'tools'`, `'typedAnswers'`, `'images'`, `'embed'`, `'hear'`, `'speak'`, `'rank'` and `'reasoning'`. Left out, the list of known models says.

`'rank'` is the seventh fixed call: `reranker.rank(words, texts)` answers a promise of one score for each text, higher where it fits the words better, through `rank` of the model's provider. A plan ranks its rows with it (`topic.plans`). A provider of the builder's own gives `rank(o)`, handed `{ words, texts }` beside what every request holds, and answers `{ scores, units?, raw? }`; one that answers no finite score for each text is `code.T7108`.

## Example

```ts
export const writer = model('writer', {
  provider: 'service',
  name: 'claude-sonnet-5-5',
  abilities: ['reply', 'tools'],
})
```

## See also

`word.model`
