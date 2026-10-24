# `state` of `project`

State that every screen and every component shares.

## Value

A record from a name to a type, or to `{ type, in, back, reset }` with `in` as `'device'` or `'browser'`. Left out, the app has no shared state. A state starts as the `default` of its type, and a `boolean` with none starts false. Any other type with no `default` is written `optional: true`, and starts as nothing.

A view reads the project's states in the `state` it is handed and changes one with the `set` it is handed, typed by their declared types: a screen's view and a component's alike, beside the states of its own (`word.component`). So a switch of the look, written once as a component, reads `state.mode` and calls `set({ mode: 'dark' })`.

## Example

```ts
export const shop = project('shop', {
  state: { mode: { type: choice(['auto', 'light', 'dark'], { default: 'auto' }), in: 'device' } },
})
```

## Errors

`code.T1014`: a state that is kept `in: 'address'`, one that states `back`, and one `in: 'device'` that is no `boolean`, `choice`, `number` or `text` with a `max` of 100 or less. Also a state that is no `boolean`, states no `default` and is not `optional`.

## See also

`word.project`
