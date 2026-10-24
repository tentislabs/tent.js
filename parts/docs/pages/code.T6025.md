# T6025 size-not-known

An `Image` whose size is neither written nor known from its file. It is a warning.

## Details

The size of a picture should be known before it loads, or the page jumps when it arrives. An `Image` states a `width`, a `height` or both. A picture of an asset that states no size takes the size of its file. For the id of a file and for an address the size is the builder's to write.

```tsx
<Image src={p.photo} alt={p.name} />                          // T6025
<Image src={p.photo} alt={p.name} width={240} height={180} />
<Image src={asset('logo.png')} alt="Tent" />                  // sized by its file
```

## The fix

Write a `width` and a `height`.

## See also

`tag.Image`
