# T9104 no-right

A request to an address of publishing came with no key, with a key that holds no right, or with one whose right is too low for what it asked. Nothing was read and nothing was written.

## Details

| The address | The right it needs |
|---|---|
| `/_t/sync/have` | Any right of publishing |
| `/_t/sync/blobs` | `push` or `publish` to send; `read` to fetch, or `bundle` for the files of what is live |
| `/_t/sync/points` | `push` or `publish` to send; `read` to fetch |
| `/_t/publish`, `/_t/publish/values` | `publish` |

A key of publishing is made on the server with `tent access key add <name> --right <right>`, or in code with `keys.add({ name, rights })` in a function that states `system`. `read`, `push` and `publish` given alone each hold the ones before them; a list holds exactly what is listed. A key of the API, and any key made without a right, is T9104 at every one of these addresses, and a key with a right is nobody at every other address.

A request with no right is counted for its address, as one of nobody is. A caller is sent the right that was needed in `fields`, under `right`.

## The fix

Make a key with the right that the address needs on the server, and keep it here with `tent login <address>`.

## See also

`command.access`, `command.login`, `command.push`
