# `workspaces`

The workspaces of a product, from its own backend code: each one person's project inside the product, with its own data and its own history. It is there only in an app that a program gave workspaces with `createWorkspaces`, and it is full access: a function uses it only where it states `system`.

## Example

```ts
import { action, text, workspaces } from 'tentjs'

export const newProject = action('newProject', {
  access: 'signedIn',
  system: 'it makes a workspace of the caller, which the handle holds to them',
  input: { name: text() },
  run: async ({ input, user }) => {
    const made = await workspaces.create({ owner: user.id, from: 'blank', name: input.name })
    return { workspace: made.id, address: made.address }
  },
})
```

## Members

| Member | Does |
|---|---|
| `create({ owner, from?, name? })` | Makes a workspace of `owner`: its files are copied from the template that `from` names, or from the workspace of that id, and it holds no data. Answers the workspace |
| `get(id)` | Answers the workspace `{ id, owner, name, createdAt, address, live }`. `live` is `{ version, address }`, the version that is live and the address it answers at, once the workspace was published, and is not there before |
| `list({ owner? })` | Answers every workspace, or those of one owner |
| `remove(id)` | Removes the workspace with its folder: its files, its data and its history |
| `values(id, { side, kind, name, value?, remove?, list? })` | Sets, removes or lists a secret or a setting of the `test` or the `live` side of the workspace. A list answers the names that are set, and never a value |
| `mail(id, { newest? })` | Answers the mail that the test side of the workspace would have sent, which is written down in place of being sent |
| `publish(id, { try?, back?, stopRuns? })` | Builds and checks the workspace and makes it live where the product says, and answers what was published |
| `tool(id, name, input, { agent })` | Carries one project tool out on the workspace, under the policy of that agent |
| `turn(id, agent, message, { budget, thread, rounds, at, wait, then })` | Starts a turn of that agent on the workspace, which builds and checks until it passes, and answers the turn |
| `turns(id, { newest? })` | Answers the turns of the workspace, the newest first |
| `undo(id, turn, { data? })` | Goes back to before a turn, with every later turn, and answers what it changed and what it could not undo |

Each member answers a promise. Every member but `create` and `list` holds the caller of the call to the workspace it names: its owner, or whoever `may` of the workspaces lets in. A workspace is reached by its id alone: an id that is no id of a workspace names none.

## Errors

`code.T0013` in an app that no program gave workspaces, and in code that has no full access. `code.T3101` for a workspace of another caller. `code.T0001` for an id that names no workspace. `code.T9105` where a workspace holds code that nothing lets run.

## See also

`topic.workspaces`, `adapter.Sandbox`, `option.agent.policy`
