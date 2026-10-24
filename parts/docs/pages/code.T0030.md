# T0030 not-the-writer

A machine that is not the writer was asked for what only the writer does.

## Details

One machine of an app writes. Every other machine is a reader: it answers what only reads, and hands a request that writes to the writer. This code is answered:

- on a reader, by a call in code that names its caller and writes, on live data: `app.call` of anything but a query, `app.write` and `app.seed`. On test data the reader sends these to its writer. And by `app.restore`, in every mode;
- by a writer that was stopped by the machine that took over, or whose lease ran out, for what writes;
- for a request that a reader handed on under another epoch than the writer's, or to a machine that is not the writer;
- by `app.takeOver` on the machine that is the writer;
- by `engine.open` on the data folder of a reader, or of a writer that was stopped: a copy never becomes a second writer by a start that forgot a word.

## The fix

Send the write as a request, with `app.request`, as its caller would, or run the code where the writer is. Start the folder of a reader with `tent start --reads <address>`, and make a reader the writer with `tent take-over`, once its writer is stopped.

## See also

`code.T0029`, `code.T0032`, `command.take-over`, `command.start`
