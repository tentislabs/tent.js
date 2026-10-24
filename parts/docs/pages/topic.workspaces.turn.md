# The turn

This page says how a turn is asked for and what it does, and how code is written in a workspace.

```ts
const turn = await workspaces.turn(project.workspace, 'builder', input.message, { budget: { tokensOut: 100000 }, thread: project.id, wait: false })
```

A turn is one message of a person to the product's agent, carried out on a workspace until what it built passes the check:

| Step | Does |
|---|---|
| 1 | Records a point of the kind `turn`, takes a snapshot of the workspace's test data with the store's count of changes, and writes the row of the turn as `working` |
| 2 | Starts the agent with the project tools, `{ message, thread }` as the caller, with what is left of the budget, and waits for its run |
| 3 | Builds and checks the workspace. With an error among the findings, it starts the agent again on the same thread with the findings as its message, three rounds at most (`rounds`). After the last, the turn is `stopped: 'rounds'` |
| 4 | Records a point of the kind `turn` again, and a snapshot of the data |
| 5 | Writes the row as `done`, with the changes in the terms of compare, the findings that are left and what it used |

`turn(id, agent, message, { caller, budget, thread, rounds, at, wait, then })` answers the turn `{ id, state, run, changes, findings, used, rounds, stopped }` once it ended, or with `wait: false` once its run started; the page shows it by the agent's `working` on that thread and by `turns`. A turn with no `thread` holds its rounds on a thread of its own, named by its id. `at: { screen, place }` names the screen and the place of the tag in its source that the person pointed at, `{ file, from, to }`, as the inspect mode tells it, which the agent is handed with the message as one line of the engine's own words, after an empty line: `The person points at the tag <file>:<from>-<to> of the source of the screen <name>.`, or `The person points at the screen <name>.` where no place is named. The person's row of the memory table holds the message so, that line at the end of its `text` (`code.T7007`). One turn works on a workspace at a time: a second waits where `then` is left out, is refused with `code.T7103` with `then: 'refuse'`, and stops the one that works with `then: 'stop'`. `budget` is held unit by unit over the rounds, so the check before every model call stops the turn as `stopped: 'budget'`; a turn whose run a person stopped is `stopped: 'person'`.

A turn is kept as it goes: its row says where it stands, and its run is saved step by step like every run. After a start of the program, `createWorkspaces` takes up each turn that still works where its row says: it waits for its run again, or goes on with the build and its rounds.

`undo(id, turn, { caller, data })` goes back to before a turn, and every later turn goes with it; a turn that still works is stopped first. It writes the files of the turn's first point, as going back does, and puts the test data back to the turn's snapshot where it is still kept and no hand changed the data outside a turn since, which the store's count of changes at each turn's end and at the next one's start tell. A row that a person adds while a turn builds and checks, once its run has ended, is such a change by hand. Otherwise it puts the files back and answers `data: 'kept'`; with `data: 'back'` it puts the data back all the same, for a product that asked its user, who then loses what they entered since. The turns that went with it read `undone`. The conversation is the product's own and no part of the workspace: the rows that the turns wrote into the memory table of the product's agent stay as they were, and `turns` names each turn that went as `undone`, with its `run`. It answers what it changed, and `kept`: what it cannot undo, named plainly, as what went live and what a tool sent out. The last `turnsKept` turns keep their snapshots; an older turn is undone for its files. Going back is a table change of the test data as any other: an undo of the turn that added a table which now holds rows takes that table away, which is refused with `code.T2003` unless `removed` of the workspace's project names it, as a publish would be.

The AI works on the test side alone: `run` calls as a test user or as nobody, mail is written down and not sent unless the workspaces were made with `mail: true`, and a service is called with the test values of its secrets. Live is reached through `publish`, which the product calls and no project tool does.

## Code in a workspace

A workspace is code, as every app is, and is never held to plain definitions. It is run in one of two ways: a workspace whose owner holds a role that `trusted` names is built and run in the engine like any project; every other is built in a box, behind the `sandbox`, which the host connects, and run in the product's engine in the `room` the workspaces were made with. Without a role of `trusted`, and without a sandbox and a room, it is refused with `code.T9105`.

The box is handed the project to read and a folder of its own to write. The build of its test side is `tent build --dev --out <work>/builds/<n> --json`, a development build, so the inspect mode tells the place of what a person points at in its preview; what is published is built the same without `--dev`, as a release. The workspaces read the findings of each build; the bundle it wrote is read by the product as data and opened in its own engine, as any workspace is: under its address, with its data in `<folder>/<id>/data/`, with `lazy`, `sleepAfter`, `framedBy`, its mailbox, `identify` and `counting`, and its requests through the door like any app's, but that its code runs in the `room`. Every cookie of the product's own names, and a `Tent-Caller` that a visitor sent, are taken out of a request for a workspace. It sleeps and wakes as any workspace does, and is published like any workspace, into the product's own engine with the same room, or to a `Target` with the bundle its box built: the product's own program never loads that code.
