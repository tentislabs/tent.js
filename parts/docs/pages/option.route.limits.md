# `limits` of `route`

The limits of the route.

## Value

`{ time, size }`. Left out, the `actionTime` and the `callSize` of the project hold.

## Example

```ts
export const feed = route('feed', {
  method: ['GET', 'HEAD'],
  path: '/feed.xml',
  access: anyone('the feed is public'),
  run: () => new Response('<feed />'),
  limits: { time: '30 seconds', size: '1 MB' },
})
```

## See also

`word.route`
