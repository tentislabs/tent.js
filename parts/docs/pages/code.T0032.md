# T0032 writer-runs

`app.takeOver`, or `tent take-over`, was asked of a reader that is current: its writer runs.

## Details

Two writers must never both write. A reader that is current was answered a beat by its writer a moment ago, so that writer runs. The fix of the error names the moment from which taking over will pass.

## The fix

Stop the writer first. A reader stops being current `behind` after the last beat that its writer answered, 5 seconds where the project states nothing: then take over.

## See also

`code.T0029`, `code.T0030`, `command.take-over`
