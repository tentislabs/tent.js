# T6012 bad-screen-part

A part of a screen that does not fit.

## Details

An app has one `notFound` screen and one `error` screen, and each is open to `'anyone'`. It has one `grant` screen and one `ask` screen, and each is for `'signedIn'`: the person they ask is the one who signed in. `layout` and `loading` name a component. A component never holds itself, straight or through others. `seo.addresses` reads a query that anyone may call, since anyone asks for the sitemap.

```ts
layout: 'Shell',                         // T6012 where no component is named Shell
seo: { addresses: read(openOrders) },    // T6012 where openOrders is for signed-in callers
```

## The fix

Mend the part that the finding names.

## See also

`option.screen.layout`, `option.screen.seo`, `word.component`
