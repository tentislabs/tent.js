# T1009 reserved-name

A name is used that the framework keeps for itself.

## Details

A definition whose name starts with `_t_`, or that is named `mail` or `files`. A table named `system`, `sql`, `n`, `read` or `write`, which are members of `db`. A column named `id`, `createdAt`, `updatedAt`, `any`, `all` or `not`, and a column named `distance` beside a vector column. The input field `run` of a flow that is offered, and of an action that states `worker` or `background`. A function that is offered to the API under the name `docs`, one that is offered to MCP as `findFunction` or `callFunction`, and a command under the word `login`, `logout`, `whoami`, `help` or `file`. A setting and a secret named `then`: the runtime takes whatever answers a member of that name for a promise. A tool of an agent that is told under `call` or `sequence`, where the agent states `tell: 'list'` or `sequence`, and, where it states `sequence`, under `all`, `fill`, `fail`, the name of a value word, or the name of a type word of a sequence, as `text` and `number`.

## The fix

Give it another name. For a function that is offered, the project may give it another name at that door: `api.names`, `mcp.names` and `cli.names`. For a tool of an agent, `name` of its entry of `tools` gives it another name.

## See also

`topic.words`, `option.agent.tools`
