# `dayOf`

The calendar day of a moment in a time zone. With no zone it is the zone of the project.

## Example

```ts
const day = dayOf(order.placedAt, 'Europe/Istanbul')
```

## Returns

The day, as `'2026-10-08'`. A day answers itself, and nothing answers nothing. With no zone it asks the engine: where a definition is being made it answers its record.

## Errors

`code.T0027`: a value of another kind than the word works with, or a value past the limit `valueSize`.

`code.T1014`: a zone that is written and that the runtime does not know, when the project is described.

## See also

`topic.values`
