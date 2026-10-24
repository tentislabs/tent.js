# T6013 address-not-allowed

A literal address of a `Link`, of `useGoTo`, of `then` of a `Form`, of the head or of the `src` of an `Image`, of a kind that is not allowed.

## Details

`to` of a `Link`, a move of `useGoTo` and `goTo` of `then` take a screen, a path of the app or `#<id>`. A path starts with one `/` and holds no `//`, no backslash and no control character, as it is written and once its percent signs are read: so nothing that is written as a path can lead out of the app. `href` of `then` takes an address whose kind is `https`, `http`, `mailto` or `tel`; any other kind, `javascript` among them, is refused, and so is an `href` that is worked out from a text which starts with a path of the app: that is `goTo`. `src` of an `Image`, `href` of a `link` line of the head and `src` of a `script` line take an asset, or an address whose kind is `https` or `http`; `src` of an `Image` also takes the id of a file.

```tsx
<Link to="//evil.example/">Away</Link>                              // T6013
<Form call={pay} then={{ href: 'javascript:alert(1)' }}>            // T6013
```

An address that is worked out while running is held by the tag: a `Link` then draws no address and makes no move, and `then` goes nowhere.

## The fix

Name a path of the app with `to` or `goTo`, and an address of another site of an allowed kind with `href`. A link to another site is a plain `<a href>`.

## See also

`tag.Link`, `tag.Form`, `hook.useGoTo`
