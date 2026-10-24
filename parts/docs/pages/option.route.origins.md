# `origins` of `route`

The other sites that may send the route a request that changes something.

## Value

A list of sites, or `anyone('why')` for every site. Left out, only the app's own.

## Example

```ts
export const feed = route('feed', {
  method: ['GET', 'HEAD'],
  path: '/feed.xml',
  access: anyone('the feed is public'),
  run: () => new Response('<feed />'),
  origins: ['https://www.example.com'],
})
```

## See also

`word.route`
