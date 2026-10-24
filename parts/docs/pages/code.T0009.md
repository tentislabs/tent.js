# T0009 internal

Something went wrong that is not the caller's to see. A caller gets it with the status 500 and a `ref`: eight characters that find the full error and its trace in the log.

## Details

It is what a caller gets for every error of the framework that has no status of its own, and for every error that is no `TentError`. The message a caller is sent says nothing of the app's code.

The framework also raises it itself where its own parts do not fit together: a shape of the description that names a shape which nothing has kept, and a stored body whose chain goes on from a value that `db` did not hand out.

## The fix

Find the error in the log by its `ref`. The log holds the full error, with its code, its message and its trace.
