# T6032 seo-image-not-public

A screen whose `seo.image` names a component is not open to anyone, or one of its own `data` entries is not. An error.

## Details

The picture of a shared link is drawn as nobody, and is handed to whoever a link reaches: a chat app, a social site, anyone who holds the address. A screen that only some may see would show them nothing, or what only some may see.

```ts
access: 'signedIn',
seo: { image: { view: OrderPicture } },   // T6032
```

## The fix

Name a picture in `seo.image` in place of a component, or make the screen and the entries it reads `access: 'anyone'` where everything it shows may be seen by anyone.

## See also

`option.screen.seo`, `option.screen.access`
