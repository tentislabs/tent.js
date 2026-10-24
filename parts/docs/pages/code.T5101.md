# T5101 too-many-steps

A run came to more steps than its flow allows. The error names the step and its number.

## Details

A run may hold 1,000 steps where its flow states nothing. Each pass of a step that stands in a repeat counts as a step of its own, so a loop over a long list reaches the limit soon. The run has failed with this code, and keeps the steps it finished.

## The fix

Start a run for each part of the work, so that no single run holds them all. Where one run truly needs more steps, raise the limit: `limits: { steps: 5000 }` on the flow.

## See also

`topic.flows`, `option.flow.limits`
