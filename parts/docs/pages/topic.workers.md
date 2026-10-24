# Heavy work on other machines

Some work is too long or too heavy for the machine that answers people: a video, a large file, a big import, a model on a graphics card. A builder hands such work to another machine, a worker, by saying so in the definition.

## Where work runs

| Stated on a step or an action | Runs |
|---|---|
| Nothing | Where it is called, as always |
| `background: true` | On a worker of the kind `any`, and on a thread of the writer while none is joined |
| `background: 'here'` | On a thread of the writer, always |
| `worker: 'gpu'` | On a worker of the kind `gpu` and nowhere else: it waits for one |

A kind is stated in `project.workers`, with what holds for it: `atOnce`, `wait`, `queue`, `order`, `turns`, `place`, `lost`, `next`, `orHere`, `systemWork`. `workers.any` holds for `background` alone.

## A worker

A worker holds the app's code and none of its data. It joins its writer with a key, says which kinds it is, and is handed work: `tent start --works <address> --key-from <file> --kinds gpu,any --data <folder>`, or `engine.work({ from, key, kinds, folder })` in code. The writer lets join a key of the right `work`, made with `tent access key add <name> --right work --kinds gpu,any --at-once 8 --workers 1` or `keys.add({ name, rights: ['work'], work: { kinds, atOnce, workers } })`, and the keys that `workers` of `engine.open` names. A key is bound to the kinds its workers may state, to the most tasks one of them takes at once, and to how many may be joined under it, 1 where it states none: one past any of them is answered T5109. Such a key reaches what the tasks it is handed may reach, so it is kept as the secrets of the writer are; a worker whose key is removed is let go, and its tasks are handed out again.

The work on a worker is handed what it is handed on the writer: `input`, `user`, `db`, the handles, the value words. A read through `db`, a call of a function, a `start` and a member of a handle cross to the writer as a call, and are carried out there as the caller of the run.

## Tries

A task is one try of one step, handed to one worker with a try number. The worker says that it is alive every beat. Where it falls silent for `workBehind` and one beat, its tasks are lost, and each is handed out again under the next number; only the current try is believed (`code.T5108`). A try lost to a machine counts against `lost` of the kind; past it the step fails with `code.T5107`, or goes to `next`.

## An action

An action that states `worker` or `background` is carried out as a run of one step, `call`: its caller waits for it within the time of the action. A run that outlasts it goes on, and the caller is answered `code.T0008` with the run in `fields.run`; the same call with `{ run }` waits for it again, and `{ run, stop: true }` stops it.

## Calls outside

The work on a worker makes its calls of services, of models and of `fetch` itself, with the secrets and the providers of its own machine. Before each it sends its writer a `may`, and after it a `did`: the writer holds the call to the limits of the service, of the model and of the run, counts what a model used under the caller of the task and in `used` of its run, and writes the row of `outgoing` in its log. The sorts that `outside` of the kind names, `{ services, models, fetch }` or `'writer'` for all three, are made by the writer instead.

## Machine time

Machine time is counted in the counts, as the calls of models are, with `name` the definition and `answeredBy` the kind, in seconds. Each second that a worker holds tasks is shared evenly among them: a task's share is `workSeconds`, under its definition, its kind and the starter of its run, and a try that was lost or handed back counts the same seconds as `lostSeconds` beside it. A batch shares its seconds among its entries by `measure`, or evenly. Each is written in the write that settles the try, so a task is booked to the day in which it ends; the `cpuMs` its worker reports is counted under the name of its run, and `used` of the run holds all three. The seconds a worker was joined with no task are `idleSeconds`, and those before it was ready for any version `loadSeconds`, under its first kind with no name and no caller. A kind that states `countBy: 'app'` is counted with the caller empty.

`limits: { perDay, perCallerPerDay, atLimit }` of a kind, and `limits.perDay` of an action, hold the work of a day to units of machine time: `workSeconds`, and for a kind `machineSeconds`, the sum of its `workSeconds`, `loadSeconds` and `idleSeconds`. Every task that is out reserves `reserve` of its definition, or the time of one try, and a task goes out only where what was used, what is reserved and its own reserve stay under each limit: so a hundred tasks at one moment cannot each pass the same limit. A task that would pass one waits, shown in `heldBack` of `app.work()` and of `Workers.need`, with the limits and what was used and reserved; `work.limit` is raised when a limit begins to hold work back, and `wait` of the kind does not run for it. It goes when a reserve is let go, or at the turn of the day of `project.zone`. A call at the door that waits for such work is refused with `code.T7102` instead, and with `atLimit: 'fail'` every try fails with it. Work whose own reserve passes a limit, and work of a run that would pass its `perRun`, fail with `code.T7102` at once. After the writer opened again, the reserves are what the tasks that are out make them.

## Seeing it

`app.workers()` lists the workers that are joined, each with what it works on; `app.work()` says for each kind what waits and what is out; `app.release(worker)` hands a worker nothing more, and answers whether it holds no task, so that its machine may be stopped.

## See also

`code.T5107`, `code.T5108`, `code.T5109`, `code.T5007`, `code.T5008`, `topic.flows`
