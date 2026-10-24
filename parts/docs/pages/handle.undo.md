# `undo`

Takes back what a run wrote, or what a program wrote with a grant or a key since a moment. It draws nothing: an app that wants a button for it writes the button, and the action behind it calls the handle, and decides who may.

## Example

```ts
import { action, json, role, text, undo } from 'tentjs'

export const undoAgent = action('undoAgent', {
  access: role('staff'),
  system: 'takes back what the agent wrote, whoever it wrote for',
  input: { run: text() },
  output: json(),
  run: async ({ input }) => undo.run(input.run),
})
```

## Members

| Member | Does |
|---|---|
| `undo.run(id, { started, dry })` | Takes back every row that one run wrote: an agent's run, a flow's run, and with `started` the runs it started |
| `undo.grant(id, { since, dry })` | Takes back what a program wrote with that grant since a moment, as what a chat app did through MCP, and nothing of another grant |
| `undo.key(id, { since, dry })` | Takes back what a key wrote since a moment |

Each answers a promise of `{ undone, clashes, outside }`: how many rows it took back, the rows it left, and what stays done outside the app. With `dry` it answers the same and changes nothing.

**How it knows.** The record of every change says by whom it was made, as `{ caller, run }`: the caller as a column keeps one - `user:<id>`, `key:<id>`, `grant:<id>` for a program that wrote with a grant - and the run it was made in, as `_t_history` keeps its `by`. So what a run wrote is read from the record, never guessed. A change that names no one - one of the system, or one recorded before the engine kept who made it - is named in `clashes` with `by: 'unknown'` where the undo reaches it, and nothing of it is taken back.

**How it takes back.** In the reverse order of the writes: a row that was added is removed, a row that was set gets its values before back, and a row that was removed is put back with its id. It is all one write, made by the caller of the undo, so it is itself a change that can be undone in its turn.

**What it never overwrites.** A row that someone else wrote after is left as it stands, and named in `clashes` with its table, its id, its columns, the values the work left (`left`) and those that stand now (`now`). That it was written is read from the record of the writes and who made them, never from its values, so a row that someone set back to what the work left is left too; so is a row of a table that a raw write stated since, and every row of data that was put back from a backup since, where `left` is not known and not given. A row that was added and that another row now links to is left, and named with no columns. What to do with a clash is the caller's.

**Where it reaches back to.** As far as the archive (`option.project.backups`). With the archive off, `undo` is refused with `code.T2028`.

**Where it works.** In an action, a route and a step, for code with full access: the function states `system`.

## Errors

`code.T2028` where the app keeps no archive. `code.T0009` where the work reaches into a gap of the archive, which it names. `code.T0001` for a run that is not there. `code.T0002` for an id that is none, and a `since` that is no moment. `code.T0013` where the function states no `system`, where no call is under way, and in a query or a change.

## See also

`command.runs`, `option.project.backups`
