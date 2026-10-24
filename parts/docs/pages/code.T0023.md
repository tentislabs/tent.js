# T0023 fetch-cut-off

An answer to the guarded fetch passed its size or its time, and was cut off. `fields.cap` says which: `size` or `time`.

## Details

An answer is cut at 10 MB and at 30 seconds, to its end, unless who asks states another size or time. The size counts the bytes as they are opened, so a packed answer cannot pass it.

An answer that passes its time before its head has arrived fails the fetch itself. One that passes its size or its time inside its body fails the reading of the body, `await response.text()` and the like.

## The fix

Ask for less in one request. Where an answer is known to need more, state it where the request is made: `size` in bytes and `time` in milliseconds.

## See also

`topic.fetch`, `code.T0022`
