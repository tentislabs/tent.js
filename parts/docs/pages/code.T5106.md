# T5106 run-stopped

A run that was waited for was stopped before it ended.

## Details

A flow that is called and waited for answers its answer. Where the run is stopped meanwhile, with `runs.stop` or `tent runs stop`, the caller that waits gets this code. Stopping a run stops the runs it waits for too. A stopped run keeps the steps it finished, and carries out no `onFail`.

## The fix

Start the run again where its work is still wanted. Code that calls a flow which may be stopped catches this code and goes on.

## See also

`topic.flows`
