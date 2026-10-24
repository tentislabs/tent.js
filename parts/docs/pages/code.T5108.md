# T5108 old-try

What a worker sent names a task that is not out to it: the task ended, or was handed out again. Nothing of it is taken.

## Details

Only the current try of a step is believed. A worker that was held still, or whose link was lost, may come back after its task was given to another worker: its `done`, its `failed`, its progress and every call it makes for that task are refused with T5108, and nothing of them is written or saved. The worker drops what it kept of the task, and ends that work.

## The fix

Nothing: the current try is carried out by the worker it is out to. A worker that is often refused so falls silent for longer than `workBehind`: give it a steadier network, or raise `workBehind` in `project.limits`.

## See also

`topic.workers`, `code.T5107`
