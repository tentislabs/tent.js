# `useNonce`

Answers the nonce of the page: the content policy lets in a style tag that carries it, so a library that writes style tags while it draws is handed it, and no project opens every style tag of its pages.

## Example

```tsx
import createCache from '@emotion/cache'
import { CacheProvider } from '@emotion/react'
import { Button } from '@mui/material'
import { screen, useNonce } from 'tentjs/ui'

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  view: () => {
    const nonce = useNonce()
    return (
      <CacheProvider value={createCache({ key: 'css', nonce })}>
        <Button variant="contained">New order</Button>
      </CacheProvider>
    )
  },
})
```

Mantine takes it as `<MantineProvider getStyleNonce={() => nonce}>`. A script line of `head` carries it by itself.

## Takes

Nothing.

## Returns

The nonce of the page, the same on the server as it draws the first HTML and in the browser for as long as the page lives, across every move between screens. Empty for a page that was written out as a file, which is sent with no content policy. Each page is sent a new one.

With `unlock: { styleTags: true }` of the project every style tag is let in, and the nonce is named nowhere in the policy.

## See also

`topic.screens`, `option.project.unlock`, `option.project.html`
