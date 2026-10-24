# `route`

An address of the builder's own that is answered with the builder's own response. It is a helper word with a record of its own, and is always code.

## Example

```ts
export const feed = route('feed', {
  method: ['GET', 'HEAD'],
  path: '/feed.xml',
  access: anyone('the feed is public'),
  run: () => new Response('<feed />'),
})
```

## Options

| Option | Means |
|---|---|
| `option.route.method` | The methods the route answers. |
| `option.route.path` | The address of the route. |
| `option.route.access` | Who may call the route. |
| `option.route.run` | The function that answers a request. |
| `option.route.system` | Gives the `db` of the route full access, with the reason. |
| `option.route.origins` | The other sites that may send the route a request that changes something. |
| `option.route.limits` | The limits of the route. |
| `option.route.was` | The old name of the route, where it was renamed. |

## Returns

A record that carries its options. Nothing calls it.

## See also

`topic.words`
