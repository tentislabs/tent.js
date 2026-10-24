# T0003 too-large

A call or an upload over its size limit. A caller gets it with the status 413.

## Details

The body of a call may hold `callSize` bytes, 1 MB where the project states none. A body that states more in its length is refused before any of it is read, and one that states none is refused at its first byte past the limit, so that no body is held whole before it is refused. The connection is closed once it is answered.

A body that states a `Content-Encoding` is refused with this code too: the engine opens no packed body.

## The fix

Send less in one call, and send a file as an upload. Where calls truly are that large, raise `callSize` in `limits` of the project. Send a body as it is, with no `Content-Encoding`.

## See also

`code.T0002`, `word.project`
