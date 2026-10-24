# T0029 not-current

A machine cannot answer for now. The caller may ask again.

## Details

An app may run on one writer and any number of readers. A reader answers by itself only while it is current: while it has applied what its writer held at a beat that was answered no longer ago than `behind` of `limits`. This code is answered by:

- a reader that is not current and cannot reach its writer, on `/_t/health` too;
- a reader whose writer did not take the request in time, or whose answer did not arrive whole. The error then holds `fields: { sent: 'true' }`: the request may have been carried out, and a caller who must not write twice asks before it sends again;
- a writer that stands back for a reader that holds more writes than it does, that holds no lease, or that was stopped by the machine that took over, for what only reads;
- `engine.read` on an empty data folder that cannot reach its writer;
- `app.takeOver` on a reader that does not hold the whole data yet.

## The fix

Ask again in a moment. Where it stays, see with `tent machines` which machine is the writer and whether it runs. A writer that stands back waits for `tent take-over` on one of the two machines.

## See also

`code.T0030`, `code.T0032`, `command.machines`, `command.take-over`
