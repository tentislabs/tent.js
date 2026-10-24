# `FileStore`

Where the bytes of the files of an app lie. The store that ships is a folder beside the data of the app, and `word.s3` gives one for storage that speaks the S3 protocol.

## Interface

```ts
interface FileStore {
  shared?: true
  direct?(name: string, info: { size: number; kind: string }, seconds: number): Promise<string>
  put(fingerprint: string, bytes: ReadableStream<Uint8Array>, info: { size: number; kind: string }): Promise<void>
  get(fingerprint: string, range?: { from: number; to?: number }): ReadableStream<Uint8Array>
  remove(fingerprint: string): Promise<void>
}
```

A store keeps bytes under their fingerprint and knows nothing else: the ids, names and kinds of files, and keeping the same bytes once, are the engine's. Bytes go in and out as streams, so the size of a file is never the size of the memory. `get` answers the bytes from `from` to `to`, both counted from 0 and both among them, and throws for bytes that are gone. `shared` says that every machine of the app reaches this store, so a reader fetches no file from its writer. `direct` answers an address of the store for one upload straight to it, under a name of 64 hex characters, with its size and its kind, that lasts `seconds`: with it, an upload goes to the store and not through the engine. A store may have `close`, which the engine calls when the app is closed.

## Example

```ts
// engine.ts
import type { FileStore, Makers } from 'tentjs/engine'

const kept = new Map<string, Uint8Array>()
const files: FileStore = {
  put: async (fingerprint, bytes) => {
    kept.set(fingerprint, new Uint8Array(await new Response(bytes).arrayBuffer()))
  },
  get: (fingerprint, range) => {
    const bytes = kept.get(fingerprint)
    if (!bytes) throw new Error(`no bytes under ${fingerprint}`)
    const part = range ? bytes.subarray(range.from, range.to === undefined ? undefined : range.to + 1) : bytes
    return new Blob([part]).stream()
  },
  remove: async (fingerprint) => {
    kept.delete(fingerprint)
  },
}
export default { files: () => files } satisfies Makers
```

## See also

`word.s3`, `handle.files`, `option.project.backups`, `adapter.Store`
