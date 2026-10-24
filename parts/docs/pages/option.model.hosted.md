# `hosted` of `model`

The provider's own tools that the model is offered: tools that the provider's server runs itself, inside one call.

## Value

A list of names. Left out, none is offered. A provider that ships knows these: `anthropic` gives `webSearch`, `webFetch` and `codeExecution`; `openai` gives `webSearch` and `codeInterpreter`; `google` gives `webSearch`, `urlContext` and `codeExecution`. A name that the provider of the model does not know is `code.T1014`; a provider of the builder's own is handed whatever is named, as `hosted` of its request.

A hosted tool sends data out: what the model hands it leaves for the server of the provider's choosing. In a run of an agent, a hosted tool that the agent's `trust` names is offered from the first model step; any other is asked about once before the first model step, in the step `ask hosted <name>`, which shows `{ tool, hosted: true }`: a yes offers it for the run, and a no leaves it out. In a run where nobody can be asked, only the trusted ones are offered. A model call from code - `writer.reply(...)` - is offered every hosted tool of the model. What the server reports of them is counted as units: `webSearches` for `anthropic`.

## Example

```ts
export const surfer = model('surfer', {
  provider: 'anthropic',
  name: 'claude-sonnet-5-5',
  key: secret('ANTHROPIC_KEY'),
  hosted: ['webSearch'],
})
```

## Errors

`code.T1014`: a name that the model's provider does not know.

## See also

`word.model`, `option.agent.trust`
