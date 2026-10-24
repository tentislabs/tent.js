# `url` of `s3`

Where the store answers, with its scheme. The bucket is named in the path of each address.

## Value

A text, `settings.<name>` or `secret(...)`, which the engine works out when the store is first used. It is required.

## Example

```ts
files: { store: s3({ url: 'https://storage.example.com', bucket: 'shop-files', key: secret('STORE_KEY') }) }
```

## Errors

`code.T0019` where the secret holds no value.

## See also

`word.s3`, `option.project.files`
