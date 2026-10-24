# T5103 wait-too-long

A wait of a flow is longer than its flow allows. The error names the wait.

## Details

`step.wait` and the `timeout` of `step.waitFor` may be one year where the flow states nothing. The wait refuses its promise with this code, and nothing is saved of it.

## The fix

Wait for less. Where a run truly waits longer, raise the limit: `limits: { wait: '3 years' }` on the flow.

## See also

`topic.flows`, `option.flow.limits`
