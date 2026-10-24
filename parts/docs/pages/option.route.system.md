# `system` of `route`

Gives the `db` of the route full access, with the reason.

## Value

Text that says why. Left out, the route reads as its caller.

## Example

```ts
export const feed = route('feed', {
  method: ['GET', 'HEAD'],
  path: '/feed.xml',
  access: anyone('the feed is public'),
  run: () => new Response('<feed />'),
  system: 'reads every note',
})
```

## See also

`word.route`
