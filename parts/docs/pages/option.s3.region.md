# `region` of `s3`

The region the requests are signed for.

## Value

A text, as `eu-central-1`. Left out, `us-east-1`.

## Example

```ts
files: { store: s3({ url: 'https://s3.eu-central-1.amazonaws.com', bucket: 'shop-files', key: secret('STORE_KEY'), region: 'eu-central-1' }) }
```

## See also

`word.s3`
