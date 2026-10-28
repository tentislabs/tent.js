# `update` of `declared`

Whether the table of access is kept anew.

## Value

`true`: what each caller got in this run is written into `tests/declared/access.json`, in place of what was kept, as `tent test --declared --update` does. Left out, a run holds what came to the table that is kept, and a change fails.

## Example

```ts
await declared({ update: true })
```

## See also

`word.declared`, `topic.tests.declared`, `command.test`
