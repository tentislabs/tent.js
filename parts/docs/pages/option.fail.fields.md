# `fields` of `fail`

What the error tells beside its words, each by its name.

## Value

A record of texts by name. The caller is sent them in `fields` of the error.

## Example

```ts
fail('not-charged', 'This order was never charged.', { fields: { order: input.order } })
```

## See also

`word.fail`, `topic.errors`
