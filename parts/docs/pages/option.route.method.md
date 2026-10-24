# `method` of `route`

The methods the route answers.

## Value

One method or a list of them, as `'GET'`. It is required. A request with another method is not found.

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
