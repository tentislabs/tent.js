# `limits` of `action`

The limits of the action.

## Value

`{ time, try, reserve, lost, perDay, atLimit, runKept }`. Left out, the `actionTime` of the project holds.

## Example

```ts
export const sendNote = action('sendNote', {
  access: role('staff'),
  run: async ({ input }) => ({ ok: input.note.length > 0 }),
  limits: { time: '30 seconds', try: '10 seconds', reserve: '5 seconds', lost: 3, perDay: { workSeconds: 3600 }, atLimit: 'wait', runKept: '1 hour' },
})
```

## See also

`word.action`
