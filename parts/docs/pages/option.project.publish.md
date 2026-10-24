# `publish` of `project`

What a new version must pass before it goes live.

## Value

`{ health, within }`: the name of a query that the new version must answer, and how long it may take. Left out, nothing is asked.

## Example

```ts
export const shop = project('shop', {
  publish: { health: 'countNotes', within: '10 seconds' },
})
```

## See also

`word.project`
