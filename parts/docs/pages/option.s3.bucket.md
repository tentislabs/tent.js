# `bucket` of `s3`

The bucket the bytes lie in.

## Value

A text, the name of the bucket at the store. It is required.

## Example

```ts
files: { store: s3({ url: 'https://storage.example.com', bucket: 'shop-files', key: secret('STORE_KEY') }) }
```

## See also

`word.s3`
