# `model` of `vector`

The model that makes the vectors.

## Value

A `model` definition that has the ability `embed`. Left out, the vectors come from elsewhere, and nothing is held to a model.

## Example

```ts
meaning: vector({ size: 1536, model: embedder })
```

## See also

`word.vector`, `topic.types`
