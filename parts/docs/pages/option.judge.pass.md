# `pass` of `judge`

The score at which an answer passes, from 0 to 1.

## Value

A number from 0 to 1. Left out, 0.7.

## Example

```ts
with: judge(writer, 'Answers from the documents and names the page', { pass: 0.8 })
```

## See also

`word.judge`, `option.agent.score`, `option.agent.guards`
