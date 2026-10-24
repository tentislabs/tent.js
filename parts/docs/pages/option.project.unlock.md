# `unlock` of `project`

The ways out of the content policy of a page, each of which opens one thing.

## Value

`{ scripts, styles, fonts, frames, styleTags, wasm, blobWorkers, eval, camera, location, microphone, more }`. Left out, nothing is opened.

## Example

```ts
export const shop = project('shop', {
  unlock: { scripts: ['https://js.stripe.com'], styleTags: true, more: { 'img-src': ['https://*.example.com'] } },
})
```

## See also

`word.project`
