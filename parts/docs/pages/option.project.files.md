# `files` of `project`

Where the bytes of the app's files lie.

## Value

`{ store }`. `store` is a store of files, `s3(...)`, that every machine of the app reaches. Left out, the bytes lie in `files/` of the data folder, which is copied beside the backups.

The engine keeps the bytes of each file there under their fingerprint and nothing else: the rows of `_t_files`, with the name, the kind and who may read each file, stay in the data. With a store that every machine reaches, a reader fetches no bytes from its writer. The store's address and its key are read from their settings and secrets each time the store is used, so a key that is set after the app opened is used from then on.

A store of the S3 protocol takes an upload straight to it: `POST /_t/files?name=<name>&direct`, with `Upload-Length` and `Content-Type`, answers an address of the store for that one upload, signed for ten minutes with the size and the kind that were stated, and the bytes are sent there with `PUT`. `handle.files` says how the upload is then taken in. Whoever keeps such a store states which sites may send bytes to it, in the rules of the store itself.

## Example

```ts
export const shop = project('shop', {
  files: { store: s3({ url: settings.storeUrl, bucket: 'shop-files', key: secret('STORE_KEY') }) },
})
```

## Errors

`code.T0009` where the store refuses a request, and `code.T0019` where the secret of its key holds no value.

## See also

`word.s3`, `handle.files`, `option.project.backups`
