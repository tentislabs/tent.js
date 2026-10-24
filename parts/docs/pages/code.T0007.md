# T0007 version-gone

The version that a page names can no longer be loaded. A caller gets it with the status 409.

## Details

A call may name the version its page was built from, in `"version"` of its body. While that version can be loaded the call is served by it. After that the answer is this code, and holds `running`, the id of the version that is running now. A `watch` of the live connection names the version of its page the same way, and is answered `failed` with this code for one that can no longer be loaded (`topic.live.connection`).

## The fix

Nothing for the builder to do: the page follows the running version by itself. A program that names a version reads `running` from the answer and names that one.

## See also

`code.T0001`, `topic.engine`
