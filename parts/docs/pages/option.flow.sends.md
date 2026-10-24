# `sends` of `flow`

Whether the flow sends data out.

## Value

True or false. `false` is the builder's word that it sends nothing. Left out, a flow whose `run` is code sends, and a plain flow sends when what it calls sends: `mail.send`, a call of a service that does not state `sends: false`, or a function, a flow or a model that sends. A person is asked before an agent runs one that sends, unless its `trust` names it.

## Example

```ts
export const tidy = flow('tidy', {
  run: async ({ input, step }) => {
    await step('count', () => countNotes())
    return { team: input.team }
  },
  sends: false,
})
```

## See also

`word.flow`
