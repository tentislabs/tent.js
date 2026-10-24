# `images` of `project`

What the image door answers.

## Value

`{ widths, formats }`: a list of whole numbers, and a list of `'avif'` and `'webp'` in the order they are tried. Left out, the widths are 320, 640, 960, 1280, 1920 and 2560, with both formats.

## Example

```ts
export const shop = project('shop', {
  images: { widths: [320, 640], formats: ['avif', 'webp'] },
})
```

## See also

`word.project`
