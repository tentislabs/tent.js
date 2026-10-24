# T7001 ability-missing

A model was asked for something it cannot do: a call of an ability that it does not have, or a call that its provider has no member for.

## Details

The abilities of a model are `reply` (with it `stream`), `tools`, `typedAnswers` (with it `fill`), `images`, `embed`, `hear`, `speak` and `reasoning`. A model whose name the list of a shipped provider knows has the abilities the list gives it; any other states them in `abilities`. What a definition states wins over the list.

- `writer.fill(...)` on a model without `typedAnswers`, `writer.embed(...)` on one without `embed`, and so on.
- A `reply` that hands `images` to a model without `images`.
- An agent with tools whose model lacks `tools`, and one that states `tell: 'list'` or `sequence` on such a model.
- A call of a model as a function, where the model states neither `input` and `output` nor a `call` of a service.

The check finds it where it can see the call, and a call that it could not see fails with it while it runs. A model in `fallback` that lacks the ability is passed over, and is never the cause.

## The fix

Give the model the ability in `abilities`, where its server has it, or ask a model that has it.

```ts
export const local = model('local', { provider: 'openai-style', name: 'qwen3', url: 'http://localhost:11434/v1', abilities: ['reply', 'tools', 'typedAnswers'], takes: 32000 })
```

## See also

`option.model.abilities`, `word.model`, `adapter.Provider`
