# `for` of `screen`

Makes the screen one of the four special screens, in place of an address.

## Value

One of `'notFound'`, `'error'`, `'grant'` and `'ask'`. The `notFound` screen is shown for an address that no screen has, and the `error` screen when something fails: both are for anyone. The `grant` screen asks a signed-in person whether a program may act for them, and is handed `grant`: `{ name, host, named, scopes, for, word, allow, refuse }`; the `ask` screen asks them to agree to one call of a program, and is handed `ask`: `{ title, tool, input, allow, refuse }`. Both are for `'signedIn'`, a press calls `allow` or `refuse`, and no site shows them in a frame (`topic.mcp.signIn`). A project has at most one of each, and where it has none the engine draws a built-in one. A screen states `for` or `path`, never both.

## Example

```tsx
import { screen } from 'tentjs/ui'

export const lost = screen('lost', {
  for: 'notFound',
  access: 'anyone',
  view: () => <h1>This page does not exist.</h1>,
})
```

## Errors

`code.T1007`: `path` is stated too.

`code.T1014`: a value that is none of the four.

`code.T6012`: a second screen of one kind, a `notFound` or `error` screen that is not for `'anyone'`, and a `grant` or `ask` screen that is not for `'signedIn'`.

## See also

`word.screen`, `option.screen.path`
