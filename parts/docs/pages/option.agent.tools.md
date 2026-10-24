# `tools` of `agent`

The tools of the agent.

## Value

A list of definitions, which may be empty. An entry may be `{ tool, tries, about, line, name }`, where `name` is another name under which a model is told the tool. A tool may be a function, a flow, an agent, a model that states its own `input` and `output` (`option.model.input`), called as a function, or an outside server (`topic.mcp.outside`), which stands for each tool its lock approves, told as `<service>.<tool>` in a call, in the list of `tell: 'list'` and in a sequence alike. It is required.

An action called as a tool may run twice where the program is killed while it runs, as any action may: the run tries its tool call again when it wakes.

A flow is a tool as a function is. It states `about`, `input` and `output`, by which the model is told it (`code.T7009`), and `as: 'starter'`, since the agent runs as the person who started it (`code.T7012`). A call of the model is then a step of the run, `tool 1.1 tidy` for its first, which starts a run of the flow with the input the model gave, waits for it, and hands the model what the flow answers. An agent that is a tool is handed `{ message, files }`, and `thread` where it keeps a memory.

A tool that states `danger: 'ask'`, and one that sends data out and that `trust` does not name, asks a person before each call. The run waits in a step of its own, `ask 1.1` for the first call, which `asks` of `hook.useAgent` and of `working` show with the tool and the input. A yes, `approve`, makes the call; a no, `refuse`, or no answer within `limits.ask`, 7 days where it is left out, tells the model `code.T7111` in place of an answer, and the run goes on. A test answers it with `app.runs.approve(run, 'ask 1.1')`.

## Example

```ts
export const helper = agent('helper', {
  model: embedder,
  instructions: 'You help with notes.',
  tools: [countNotes, { tool: nightly, tries: 2, about: 'Tidies up at once', line: false, name: 'tidyNow' }],
  limits: { steps: 12, perRun: { tokensOut: 50000 }, time: '10 minutes', ask: '7 days', result: '1 MB', toolCalls: 100, toolsAtOnce: 8, pass: '5 seconds' },
})
```

A flow as a tool, which asks before each call:

```ts
export const tidy = flow('tidy', {
  about: 'Marks a note done',
  access: 'signedIn',
  as: 'starter',
  input: { note: text() },
  output: text(),
  danger: 'ask',
  run: async ({ input, step }) => {
    await step('close', () => closeNote({ note: input.note }))
    return 'closed'
  },
})

export const helper = agent('helper', {
  model: writer,
  instructions: 'You help with notes.',
  tools: [tidy],
  access: 'signedIn',
  limits: { steps: 8, perRun: { calls: 100 } },
})
```

## Errors

`code.T1009`: a tool is told under `call` or `sequence` where the agent states `tell: 'list'` or `sequence`, or under `all`, `fill`, `fail`, the name of a value word or of a type word of a sequence where it states `sequence`, or under `answer` where it states `output`.

`code.T7009`: a flow that is a tool does not state `about`, `input` and `output`.

`code.T7012`: a flow that is a tool does not state `as: 'starter'`.

`code.T7111`: a call that a person was asked about and did not agree to, as the model is told it.

## See also

`word.agent`, `hook.useAgent`, `option.agent.trust`
