# `needed` of `read`

Makes the screen not found, with status 404, when the entry answers nothing, and when its query fails as not found.

## Value

`true`. A query fails as not found with `code.T0001`, `code.T2103`, or a `fail('not-found', ...)` of its own. So the entry is never nothing in its view, and the type checker holds the view to that. Left out, the view is handed what the query may answer, nothing among it, and must look before it reads.

## Example

```tsx
data: ({ params }) => ({ order: read(getOrder, { id: params.id }, { needed: true }) }),
```

## See also

`word.read`, `option.screen.data`
