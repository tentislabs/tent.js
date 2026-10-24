# `onRequest` of `project`

A function that every request of the app is handed first.

## Value

A function `(request, next, about)` that answers a response. It is code, and is stored as a module. Left out, a request goes straight to the door.

## Example

```ts
export const shop = project('shop', {
  onRequest: (request, next) => next(request),
})
```

## See also

`word.project`
