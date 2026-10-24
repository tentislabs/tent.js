# `run` of `route`

The function that answers a request.

## Value

A function that is handed `{ request, params, user, db, about }` and answers the standard response. It is code. It is required.

## Example

```ts
export const feed = route('feed', {
  method: ['GET', 'HEAD'],
  path: '/feed.xml',
  access: anyone('the feed is public'),
  run: () => new Response('<feed />'),
})
```

## See also

`word.route`
