# `zone` of `project`

The time zone for schedules and for the day of a moment.

## Value

The name of a zone, as `'Europe/Istanbul'`. `'UTC'` when left out.

## Example

```ts
export const shop = project('shop', {
  zone: 'UTC',
})
```

A page shows a moment in the viewer's own zone, which it keeps in the cookie `tent_zone`. The first HTML of a first visit, which has no cookie yet, shows it in this zone, and the page corrects it once it has come alive.

## See also

`word.project`
