# T7007 memory-table

The table in `memory.in` of an agent does not have what a memory table must have. The check finds it.

## Details

A memory table holds:

| Column | As |
|---|---|
| `who` | `choice` of `'user'`, `'assistant'`, `'tool'` and `'summary'` |
| `text` | optional `text` with `lines: 'many'`, with no `max` and no `pattern` |
| `data` | optional `json` |
| `run` | optional `text` |
| the column of the conversation, `thread` or the one `memory.thread` names | a `link` |
| the column its `owner` names | an optional `link('users')`, which the table names as its `owner` |

Every other column is optional or has a default, and the table states no `add` and no `change` rule: only the engine writes it. The engine writes the starter of the run as the owner of each row but a summary, where the starter is a user, so `read: 'owner'` lets each person read their own conversations.

```ts
export const messages = table('messages', {
  columns: {
    who: choice(['user', 'assistant', 'tool', 'summary']),
    text: text({ optional: true, lines: 'many' }),
    data: json({ optional: true }),
    run: text({ optional: true }),
    ticket: link('tickets'),
    by: link('users', { optional: true }),
  },
  owner: 'by',
  access: { read: 'owner' },
})
```

with `memory: { in: messages, thread: 'ticket' }` on the agent.

**The rows.** A chat screen reads them with a live query, oldest first, and draws each by its `who`:

| `who` | `text` | `data` |
|---|---|---|
| `'user'` | What the person said: with a recording, what was heard after what was typed; for a turn of workspaces that names `at`, after an empty line, the engine's line of the place they point at, `The person points at the tag <file>:<from>-<to> of the source of the screen <name>.` (`topic.workspaces.turn`) | `{ files }` where they gave files |
| `'assistant'` | What the model wrote, where it wrote something | `{ calls: [{ id, tool, input }] }` where it asked for tools |
| `'tool'` | Nothing | `{ id, tool, result }`, or `{ id, tool, error }` for a tool that failed: `id` is the one of the call it answers |
| `'summary'` | The summary of the older turns | `{ upTo }`, the last row it covers |

## The fix

Write the table as a memory table, with the columns above, as the example does.

## See also

`option.agent.memory`, `word.agent`, `option.table.owner`, `hook.useAgent`
