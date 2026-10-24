# `chunks`

Cuts a text into chunks that overlap, for search by meaning. It is a pure function: the same text and options give the same chunks on every system.

## Example

```ts
const text = await files.text(fileId)
const parts = chunks(text, { size: 1200, overlap: 150 })
```

## Options

| Option | Means |
|---|---|
| `option.chunks.size` | The most a chunk may hold. |
| `option.chunks.overlap` | How much of the end of one chunk is repeated at the start of the next. |
| `option.chunks.cut` | Where a chunk may end. |
| `option.chunks.language` | The language whose sentence rules are used. |

## Returns

A list of `{ text, at, page }`. Every chunk is a part of the text exactly as it stood: `text.slice(at, at + chunk.text.length)`. `at` is the place of its first character in the whole text. `page` is one more than the number of page marks before `at`, and is there only when the text holds a page mark, which is the form feed character. A chunk never crosses a page mark, and an empty text gives no chunks.

## Errors

`code.T0002`: an option that is not allowed.

## See also

`topic.words`
