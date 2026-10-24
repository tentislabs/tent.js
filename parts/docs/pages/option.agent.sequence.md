# `sequence` of `agent`

Lets the model hand a sequence of tool calls, written in the words of a body.

## Value

`true`. Left out, the model calls its tools one at a time. The `sequence` tool is offered on an engine that was handed a reader of source (`readBody` of `createEngine`) alone. In a run that offers it, the first answer of a tool that is a list of more than `limits.sequenceAfter` of the project (10) entries is followed by the line `To act on each of these, write one sequence.`, once.

A sequence is read and checked once, in the step `sequence N.P`, before anything of it runs: what it may not hold, and a call that is sure to fail, are `code.T7121`. Each call it makes is a step of its own, `tool N.P.K name`, and counts on `limits.toolCalls`. Where a call asks a person, the person is asked once for every call whose input is known by then. `all(list, (x) => ..., { goOn: true })` runs one arrow for each entry side by side and goes on past an entry that fails. The model is handed what the sequence returned, or, where it returned nothing or failed, what was done.

## Example

```ts
export const helper = agent('helper', {
  model: embedder,
  instructions: 'You help with notes.',
  tools: [countNotes, { tool: nightly, tries: 2, about: 'Tidies up at once', line: false, name: 'tidyNow' }],
  limits: { steps: 12, perRun: { tokensOut: 50000 }, time: '10 minutes', ask: '7 days', result: '1 MB', toolCalls: 100, toolsAtOnce: 8, pass: '5 seconds' },
  sequence: true,
})
```

## See also

`word.agent`
