# `zone` of `cron`

The time zone in which the five fields of the cron are read.

## Value

The name of a time zone, as `Europe/Berlin` or `UTC`. Left out, the `zone` of the project holds, and `UTC` where it states none.

## Example

```ts
on: cron('0 9 * * *', { zone: 'Europe/Berlin' })
```

## See also

`word.cron`, `option.project.zone`
