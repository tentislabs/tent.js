# `s3`

Names a store of files that speaks the S3 protocol, which most storage services speak: for the files of the app, in `files` of `project`, and for the archive and the copies of the backups, in `backups`.

## Example

```ts
files: { store: s3({ url: settings.storeUrl, bucket: 'shop-files', key: secret('STORE_KEY') }) },
backups: { store: s3({ url: 'https://storage.example.com', bucket: 'shop', key: secret('STORE_KEY') }) },
```

## Options

| Option | Means |
|---|---|
| `option.s3.url` | Where the store answers, with its scheme: a text, `settings.<name>` or `secret(...)`. The bucket is named in the path of each address |
| `option.s3.bucket` | The bucket the bytes lie in |
| `option.s3.key` | `secret(...)` that holds the key the requests are signed with, written as `<the id of the key>:<its secret>` |
| `option.s3.region` | The region the requests are signed for. Left out, `us-east-1` |

## Returns

The record `{ s3: { url, bucket, key, region } }`, which is stored as it is. The engine makes the store when it is first used, and works the address and the key out then. Bytes are kept there under their fingerprint and nothing else, as in every store of files, and each request is signed by the fourth version of the protocol's signing. For an upload straight to it, it hands out an address that carries its own signature, for one `PUT` of one size and one kind, for ten minutes.

## Errors

`code.T0019` where the secret of `key` holds no value, and `code.T0009` where the store refuses a request.

## See also

`option.project.files`, `option.project.backups`
