# `key` of `s3`

The secret that holds the key the requests are signed with.

## Value

`secret(...)`, whose value is written as `<the id of the key>:<its secret>`. It is required.

## Example

```ts
files: { store: s3({ url: 'https://storage.example.com', bucket: 'shop-files', key: secret('STORE_KEY') }) }
```

## Errors

`code.T0019` where the secret holds no value.

## See also

`word.s3`, `word.secret`
