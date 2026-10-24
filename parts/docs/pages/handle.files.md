# `files`

The stored files of an app, in backend code: `files.put` makes a file, and `files.get`, `files.stream` and `files.info` read one. A browser uploads at `POST /_t/files?name=<name>` and downloads at `GET /_t/files/<id>`, and a row holds a file by storing its id in a `file` column. `files.signedUrl` makes a signed address that downloads a file with no sign-in, for a time.

## Example

```ts
import { action, file, files, text } from 'tentjs'

export const report = action('report', {
  access: 'signedIn',
  input: { title: text() },
  output: text(),
  run: async ({ input }) => files.put(`# ${input.title}\n`, { name: 'report.md', kind: 'text/markdown' }),
})

export const firstLine = action('firstLine', {
  access: 'signedIn',
  input: { paper: file({ kinds: ['text/plain'], maxSize: '1 MB' }) },
  output: text(),
  run: async ({ input }) => Buffer.from(await files.get(input.paper)).toString('utf8').split('\n')[0],
})
```

## Members

| Member | Does |
|---|---|
| `files.put(bytes, { name, kind })` | Makes a loose file of the caller and answers its id. `bytes` is bytes, a stream of them, or a text, which is stored as its bytes in UTF-8. The kind is taken from the bytes, as for an upload: where the bytes say nothing, the stated one is kept |
| `files.get(id, { from, to })` | The bytes of the file, or of the part from one byte to another, both counted from 0 and both among them |
| `files.stream(id, { from, to })` | The same as a stream, for a file too large to hold. It answers at once, where every other member answers a promise |
| `files.info(id)` | `{ name, kind, size, width, height }`, with the width and the height for a picture, or nothing for a file that is not there |
| `files.text(id)` | The words of the file. Plain text, Markdown, CSV, JSON and any other `text/*` are taken as they are; of HTML the words only; of a Word document a line for each paragraph; of a PDF its pages in order, each ended by a page mark. A reader that `engine.ts` connects is asked before these, for the kinds it lists. What was read is kept, so a second reading costs nothing |
| `files.remove(id)` | Removes a loose file of the caller, with its bytes where no other file has the same ones |
| `files.setKind(id, kind)` | States the kind of a file, for a form that the reading of the engine misses. It is full access: the function states `system` |
| `files.signedUrl(id, { for })` | Answers a signed address for a time, `/_t/files/<id>?l=<text>`, that downloads the file with no sign-in until `for` has passed, as `'1 hour'`. The text is sealed under the key of the app, so only the engine reads it: it names the file, the end and the caller who made it. It is made only by a caller who may download the file at that moment, and it dies when the file is removed. It answers at once |

**Whose file it is.** A file that no row holds is loose, and belongs to who made it: a user, or a visitor by the visitor id of their browser. A loose file is removed an hour after it became loose (`limits.looseKept`). A change that stores its id in a `file` column, or in a `file` inside a `list` or an `object` column, makes that row hold it, and from then on the file is there for as long as a row holds it.

**Who may read it.** `get`, `stream`, `info` and `text` hold to the rule of a download for the caller of the call: a file is theirs to have when they may read a row that holds it, through a column that is not `private`, and a loose file when it belongs to them. Any other file is not there for them. Code with full access reaches every file.

**A file id in an input.** Every `file` value of an input is held to three things before the function is handed it: the file is there, the caller may download it, and it fits the `kinds` and the `maxSize` of its field. An id that travels as `text`, or inside `json`, is not seen, and is the function's own to check.

**The kind** is taken from the bytes for the kinds the engine knows: PNG, JPEG, GIF, WebP, AVIF, SVG, HTML, PDF, the packed formats of Word and its like, MP3, MP4, WebM, Ogg and WAV. What a sender says of such a file is not believed.

**An upload that resumes.** A large file is sent in parts. `POST /_t/files?name=<name>`, with `Upload-Length` stating the whole length and no body, begins an upload and answers `{ upload, offset }`; it is held to the `uploads` rule, the counts and the sizes as a whole upload is. Each part is sent to `POST /_t/files?upload=<id>` with `Upload-Offset`, the count of the bytes that arrived, and answers where the upload stands, or the file once its last byte is in. A request with no `Upload-Offset` asks where it stands, so a page whose connection was cut goes on from there. What arrived is kept for `limits.uploadResume` (1 hour) after the last part, under an id that only the caller who began it can name: another caller is told it is not there. The page code sends large files so.

**An upload straight to a store.** With `direct` in the address of the beginning, and a store that takes such uploads (`option.project.files`), the answer is `{ upload, address, until }`, and the bytes are sent with `PUT` to `address`, with the size and the kind that were stated. The same request with no `Upload-Offset` then takes the file in: its bytes are read for their kind, as those of any upload are, and a file whose bytes are not the size or the kind that was stated is not taken.

**Where they work.** In an action and in a route, where a call may wait. `stream` and `signedUrl` work wherever a call is under way.

## Errors

`code.T0001` when `get`, `stream`, `text`, `remove` or `signedUrl` names a file that is not there, or that is not the caller's to have: the two are told alike. `remove` says so too of a file that a row holds. An upload id that names no upload of the caller is T0001 too.

`code.T0002` when `for` of `signedUrl` is no length of time, when a part of an upload does not go on from where it stands or was cut off, and when an upload straight to a store is asked to be taken in before the store holds its bytes, or holds others than were stated.

`code.T0019` when `signedUrl` is used where the app holds no key.

`code.T2104` when a `file` value of an input, or a file id that a change stores, names a file that is not there or that the caller may not download, and `code.T2107` when a change stores a file that the type of its column does not take.

`code.T0002` when a `file` value of an input does not fit the `kinds` or the `maxSize` of its field, and when `setKind` is handed what is no kind.

`code.T0015` when `text` is asked for a kind of file that no reader knows. `code.T0008` when a reading passes `limits.readTime`, `code.T0003` when a packed file opens to more than `limits.readSize`, and `code.T0016` when the part that reads a PDF cannot be fetched.

`code.T0013` when a member that answers a promise is used in a query or a change, when a member is used with no call under way, and when `setKind` is used in a function that states no `system`.

## See also

`option.project.uploads`, `option.project.files`, `option.project.limits`, `option.project.images`, `handle.sessions`
