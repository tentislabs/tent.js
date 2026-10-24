# `privateHosts` of `project`

The hosts of this computer and of a private network that the app may reach. The guarded fetch, and the `fetch` of the app's own code, refuse every other such address.

## Value

A list of hosts, each a text. Left out, no address of this computer or of a private network is reached, but for a local address in the mode `development`.

| A line | Lists |
|---|---|
| `'10.0.0.5'` | An address, on every port, reached by a secure connection |
| `'db.internal'` | A name, with whatever it answers. A name that ends in `.local` or `.internal` is looked up only where it is listed |
| `'10.0.0.5:5432'` | One port of a host, and no other |
| `'http://10.0.0.5:8080'` | A host that is reached without a secure connection. Without `http://` in front, a listed host is reached by `https://` alone |

A name that answers a listed address is reached too, and each address that a name answers is held by itself: one that no line lists refuses the name. An address may be written in any form, and is held as the address it means.

## Example

```ts
export const shop = project('shop', {
  privateHosts: ['10.0.0.5', 'db.internal', '10.0.0.7:5432', 'http://10.0.0.5:8080'],
})
```

## Errors

`code.T0022`, where an address is reached that no line lists.

## See also

`word.project`, `topic.fetch`
