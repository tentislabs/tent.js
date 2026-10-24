# `batch` of `action`

Gathers calls of the action into one.

## Value

`{ max, wait, measure, split }`: `wait` is 0 and `split` false when left out, and `measure` names a field of the input. Left out, each call runs by itself.

## Example

```ts
export const sendNote = action('sendNote', {
  access: role('staff'),
  run: async ({ input }) => ({ ok: input.note.length > 0 }),
  batch: { max: 600, wait: '1 second', measure: 'note', split: false },
})
```

## See also

`word.action`
