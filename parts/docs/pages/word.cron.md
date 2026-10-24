# `cron`

A trigger that fires by the clock, in the five fields of cron.

## Example

```ts
on: cron('0 9 * * *', { zone: 'UTC' })
```

## Options

| Option | Means |
|---|---|
| `option.cron.zone` | The time zone in which the five fields of the cron are read. |

## Returns

The record `{ cron, zone }`.

## See also

`word.every`, `word.flow`
