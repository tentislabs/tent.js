# `danger` of `change`

Whether AIs and MCP callers ask a person before the change runs.

## Value

`'none'` or `'ask'`. `'none'` when left out. As a tool of an agent, a change that asks makes the run wait for a person's yes before each call: the ask that a page shows of the run (`option.agent.tools`).

## Example

```ts
export const addNote = change('addNote', {
  access: 'signedIn',
  set: notes.add({ body: input('body') }),
  danger: 'ask',
})
```

## See also

`word.change`
