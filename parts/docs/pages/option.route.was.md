# `was` of `route`

The old name of the route, where it was renamed.

## Value

One name, or a list of names. It is always stored as a list. Left out, nothing is taken as a rename.

## Example

```ts
export const feed = route('feed', {
  method: ['GET', 'HEAD'],
  path: '/feed.xml',
  access: anyone('the feed is public'),
  run: () => new Response('<feed />'),
  was: 'rss',
})
```

## See also

`word.route`
