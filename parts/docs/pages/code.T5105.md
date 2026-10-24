# T5105 called-too-deep

A flow was called from a run that stands as deep among the runs that called each other as the project allows.

## Details

A flow that a step calls starts a run and waits for it. Such runs stand three deep where the project states nothing: a run, one it calls, and one that one calls. The call of a fourth fails with this code, and no run is added for it. `start`, which does not wait, is not held so.

## The fix

Start the flow with `start` where its answer is not needed. Where the runs must truly call each other deeper, raise the limit: `limits: { callDepth: 5 }` in `project`.

## See also

`topic.flows`, `word.start`, `option.project.limits`
