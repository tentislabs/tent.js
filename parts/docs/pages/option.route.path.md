# `path` of `route`

The address of the route.

## Value

A pattern like a screen's, as `'/feed.xml'`. It is required.

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
