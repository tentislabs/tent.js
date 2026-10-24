# `access` of `route`

Who may call the route.

## Value

A rule. Bare `'anyone'` is taken for a route that states only `GET`. It is required.

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
