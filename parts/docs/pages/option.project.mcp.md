# `mcp` of `project`

What the app states for the MCP door, at `/mcp`.

## Value

`{ toolsListed, asks, only, clients, on, anyone, scopes, inline, stream, names }`, each of which may be left out.

| Option | Takes, and what holds where it is left out |
|---|---|
| `toolsListed` | How many tools a caller is listed at most; above it the pair `findFunction` and `callFunction` stands in their place. 20 |
| `asks` | `'engine'`: a function that states `danger: 'ask'` is refused with `code.T7120` until a person agreed. `'client'` trusts every client's own asking, and a list trusts the clients it names by the host of their document, by an id, or by a key. `'engine'` |
| `only` | `'queries'`, or a list of function names: narrows every caller at `/mcp` to them. Every offered function |
| `on` | A function of the app by the method of the standard that it answers, as `{ 'resources/list': listResources }`. None |
| `anyone` | True offers the functions whose rule is `anyone` to a request with no caller. False |
| `stream` | True keeps a stream open for a caller who asks for one. False |
| `names` | Another name for the tool of a function, by the function's name. None |
| `clients` | The clients that the builder states, each `{ id, name, redirects, for }`, where `for: 'app'` lets it ask for a token for the whole app; and `anyone('why')` among them for clients that register themselves. None |
| `scopes` | Finer scopes, each a list of the functions it opens, by its name: `{ billing: ['invoices', 'pay'] }`. None |
| `inline` | The size of a picture that travels inside an answer. 1 MB |

## Example

```ts
export const shop = project('shop', {
  mcp: { toolsListed: 20, asks: 'engine', only: 'queries', anyone: false, stream: false, names: { openOrders: 'orders' } },
})
```

## See also

`word.project`, `topic.mcp`, `code.T7004`
