# `as` of `evals`

The caller the cases run as.

## Value

A caller, as `app.user` answers one, the id of a user, `'nobody'` or `'system'`, as `app.as` takes it. Left out, `'system'`.

## Example

```ts
const maya = await app.user({ name: 'Maya', roles: [] })
const result = await evals(app, 'helper', list, { as: maya })
```

## See also

`word.evals`, `topic.tests`
