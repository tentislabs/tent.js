# T7102 limit-reached

A limit was reached: the call is refused at once, with the status 429.

## Details

It names the limit and the unit. It is raised where:

- a call of an action that states `worker` or `background` would stand behind more than `queue` of its kind of worker;
- a limit of use of a run, of a model, of a kind of worker, of an action or of a column that work fills holds the work back, at the door, or for a try under `atLimit: 'fail'`;
- a task's own reserve is more than the limit that holds it.

## The fix

Call again later. Where calls are refused often, let more wait with `queue` of the kind, join more workers of it, or raise the limit.

## See also

`topic.workers`, `code.T5107`
