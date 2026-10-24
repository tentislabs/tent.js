# T5110 out-of-memory

The system of a worker ended the work for want of memory, as far as the worker can tell. The try counts as a failure of the work.

## Details

Work in code runs inside the program of its worker and ends with it. A worker that starts again reads the count of programs that the system ended for want of memory, and where that count rose since it last kept `held.json`, it names the tasks it held with that cause. On Linux the count is that of the group of its program. Elsewhere the worker cannot tell, and such a try is lost in silence.

Where the kind of the task states `next` with `after: ['memory']`, the task goes to that kind at once, with its kept progress. Otherwise it is tried again by the `tries` of its step.

## The fix

Give the work a kind of worker with more memory, with `next: { kind, after: ['memory'] }` on the kind it starts on, or ask less of the work at once.

## See also

`topic.workers`, `code.T5107`
