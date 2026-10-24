# T5107 no-worker

No worker of its kind carried the work out. The step fails with it, and it is not tried again.

## Details

It is raised in two ways:

| How | When |
|---|---|
| No worker took it within `wait` | No worker of the kind was joined, ready for the version, and neither released nor going, for `wait` of the kind: 15 minutes where it states none |
| Its tries were lost to the machines | As many tries as `lost` of the kind allows, 10 where it states none, were lost: the worker fell silent, handed the task back, or its machine was taken away |

A kind whose `next` names the cause, `'wait'` or `'lost'`, sends the task to that kind in place of failing it. A kind that states `orHere` runs the work on a thread of the writer where no worker of it is joined.

## The fix

Join a worker of the kind, with `tent start --works <address> --kinds <kind>`, or name a `next` kind for the cause. Where machines are taken away often, raise `lost` of the kind.

## See also

`topic.workers`, `code.T5108`, `code.T5109`
