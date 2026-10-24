# T5007 worker-misused

What a definition or the project states of heavy work does not hold together. The check finds it.

## Details

| Found | Why |
|---|---|
| A `worker` that names no kind of `project.workers` and is not `'any'` | Nothing would ever take the work |
| `worker` beside `background` | `background: true` is the short form of `worker: 'any'`: state one of the two |
| A `next` that names no kind, its own kind, a ring of kinds, or no cause | A task would go nowhere, or round for ever |
| A `next` that names `'wait'` on a kind that states `orHere` | Such a kind runs its work here and never waits |
| On a kind that states `systemWork: false`, work that runs as the system, and code that states no `uses` | The writer could not hold such a task to what it may ask for |
| A limit of a kind in a unit other than `workSeconds` and `machineSeconds`, and `machineSeconds` in a limit for each caller or of a definition | Only a kind has machines that stand |
| A `remember` on a step that states no `key` | A step has no input to remember its answer by |
| An action that states `changes: false` and whose `run` calls a change or starts a run | It would write while it says it writes nothing |
| A `follow` on an action that states neither `worker` nor `background` | Only a run can be followed |

## The fix

Name a kind that `project.workers` states, or `background: true` for any. Give a `next` another kind and the causes after which a task goes there. On a kind with `systemWork: false`, state `uses` and run as the caller.

## See also

`topic.workers`, `code.T5008`, `code.T5107`
