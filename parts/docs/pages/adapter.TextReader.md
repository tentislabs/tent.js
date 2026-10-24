# `TextReader`

A reader of a kind of file that ours do not read, or that a builder reads another way: it answers the text of a file, for `files.text`. Ours read text, Markdown, HTML, CSV, JSON and Word, and PDF by a part fetched at its first use.

## Interface

```ts
interface TextReader {
  kinds: string[]
  read(bytes: Uint8Array, info: { kind: string; name: string }): Promise<string>
}
```

`kinds` lists exact kinds, as `image/png`, or a kind that ends in `/*`, as `image/*`. `read` is handed the bytes of the file with its kind and its name, and answers its text. A reader of the builder's own is asked before ours, so it can also read a kind of ours its own way. It is called on the main thread, from `files.text` alone, and held to `limits.readTime` as ours are. `textReaders` of `Makers` gives a list of them: the readers of a bundle's `engine.ts` are asked first, then those of the program, then ours.

## Example

```ts
// engine.ts
import type { Makers, TextReader } from 'tentjs/engine'

const scans = (key: string): TextReader => ({
  kinds: ['image/*'],
  read: async (bytes, { kind }) => {
    const answer = await fetch('https://scan.example.com/read', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': kind },
      body: bytes,
    })
    return answer.text()
  },
})
export default { textReaders: ({ secrets }) => [scans(secrets.SCAN_KEY.reveal())] } satisfies Makers
```

## See also

`handle.files`, `code.T0015`, `option.project.limits`
