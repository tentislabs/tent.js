# `n` of `sampleOf`

The number of the row a sample is made for.

## Value

A whole number: a text is then `<name> <n>`, one of its own for each row, as `app.make` makes the rows of a table with a unique column. Left out, a text is `A <name>`.

## Example

```ts
sampleOf({ kind: 'text' }, 'title', { n: 3 })   // 'title 3'
```

## See also

`word.sampleOf`, `word.testApp`
