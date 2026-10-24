# T5104 run-too-long

A run worked for longer than its flow allows. The error names the limit.

## Details

| The limit | Holds where the flow states nothing | Counted |
|---|---|---|
| `time` | 30 days | Over the whole run. The time a run waits does not count |
| `pass` | 5 seconds | Between two steps: from the start of a pass, and anew each time a step tool answers |

The code between two steps runs again on every pass, so it is meant to be short. A run that passed a limit has failed with this code.

## The fix

Do the work inside a step: a step may take as long as its work takes. Where the code between two steps truly needs longer, raise `limits: { pass: '30 seconds' }` on the flow, and `time` for a run that works longer than 30 days.

## See also

`topic.flows`, `option.flow.limits`
