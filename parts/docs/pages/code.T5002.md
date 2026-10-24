# T5002 step-not-awaited

A flow uses a step tool and does not wait for its promise. The check finds it.

## Details

A step is saved when its promise is kept. A flow that does not wait for it goes on, and may end, before the step is saved: its result is lost, and a later pass may carry it out again. The check reports a call of `step`, `step.wait`, `step.waitFor`, `step.all`, `step.first`, `step.many` or `step.done` that stands alone as a statement, in `run` and in a flow's own `onFail`.

A promise that is kept in a name, answered with `return`, or handed to `step.all` or `step.first` is waited for there, and is not reported.

## The fix

Write `await` in front of it: `await step('add', () => addOrder(input))`. For steps that run side by side, hand them to `step.all`.

## See also

`topic.flows`, `word.flow`, `code.T5001`
