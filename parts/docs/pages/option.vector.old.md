# `old` of `vector`

What becomes of the vectors a column holds when its model changes.

## Value

`'drop'` or `'keep'`, on a column. Left out, a change of the model is refused.

## Example

```ts
meaning: vector({ size: 1536, model: embedder, old: 'drop' })
```

## See also

`word.vector`, `topic.types`
