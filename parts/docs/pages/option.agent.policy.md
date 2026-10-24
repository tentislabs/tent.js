# `policy` of `agent`

What an agent that builds may read, change and call in a workspace, through the project tools (`topic.workspaces.tools`). Everything is refused unless the policy allows it, and the engine holds it after every tool that writes, whatever the model answered.

## Value

`{ read, edit, create, remove, tools, ask, reaches, also, mode }`. Left out, the agent is given no project tool.

| Field | Left out | Holds |
|---|---|---|
| `read` | Nothing | Which files `read`, `search` and `history` show: `'*'`, or kinds and names. `map` and `check` show the whole project to any policy that names them |
| `edit`, `create`, `remove` | Nothing | The kinds of definition each may touch: the ten words, and `agent`, `python`, `route`, `seed` (a `seed.ts` written as code), `incoming` and `command` as kinds of their own, `'*'` for all, and `'file'` for a file that holds no definition: a text, an asset, a language file, a plain `seed.ts`. A name narrows a kind: `'screen:orders*'` |
| `tools` | None | The project tools the agent is offered. One that is not offered is no tool to the model |
| `ask` | None | `'remove'`, `'rename'`, `'create'`, `'edit'`, or the name of a tool: what waits for the person, as an ask of the run |
| `reaches` | None | The hosts a service, a model or `hosts` of the project may name. `'*'` lets every host through |
| `also` | None | The options that open something wider than one definition, each refused unless it is named: `'engine'` for writing `engine.ts`, whose makers reach past every definition, `'system'` on a definition, `'unlock'`, `'api.origins'`, `'cookies'` and `'framedBy'` of `project`, `'privateHosts'` and `'roots'`, and `'runAsSystem'` for the tool `run` |
| `mode` | `'build'` | `'propose'` takes away every tool that writes, and `run`; `'frozen'` takes away every tool |

After every tool that writes, the names the file held before are held against the names it holds now: a name that is gone needs `remove`, a new one `create`, and one whose record changed `edit`, each for the kind of that definition. A write that the policy refuses is undone, and the model is answered `code.T9105` with the rule.

The policy is the product's, not the model's: it is read from the description of the product's own app, and nothing in a workspace's files, its rows or a tool's answer can change it. What it does not judge is what a change means: where `edit` names a kind, a planted text may still make the AI give a table `read: anyone('x')` or add a step that mails rows to a host inside `reaches`. Each stands in the changes of the turn, which the product shows its user; a product that wants a person before such a change names `'edit'` in `ask`.

## Example

```ts
export const builder = agent('builder', {
  model: writer,
  instructions: 'You build the app of the person, in plain definitions.',
  tools: [],
  memory: { in: messages, thread: 'project' },
  limits: { steps: 40, perRun: { tokensOut: 100000 } },
  policy: {
    read: ['*'],
    edit: ['screen', 'component', 'table'],
    create: ['screen', 'component'],
    remove: [],
    tools: ['map', 'read', 'search', 'edit', 'write', 'check', 'shot'],
    ask: ['remove', 'rename'],
    mode: 'build',
  },
})
```

## Errors

`code.T9105` where a tool asks for what the policy does not allow.

## See also

`word.agent`, `topic.workspaces`, `handle.workspaces`
