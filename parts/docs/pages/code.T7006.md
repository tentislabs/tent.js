# T7006 model-not-known

A model that the list of models does not know, and that does not say what it can do. The check finds it.

## Details

A model of a shipped provider whose name the list knows has its abilities, what it takes and its voices from the list. Any other model states them:

- `abilities`, for the fixed calls it has;
- `takes`, how much of a conversation it takes, where it has `reply`;
- `voices`, where it can `speak`.

A model that states `input` and `output`, and one over a service call, is a function, and needs none of them.

## The fix

State what the model can do and how much it takes.

```ts
export const local = model('local', { provider: 'openai-style', name: 'qwen3', url: 'http://localhost:11434/v1', abilities: ['reply', 'tools'], takes: 32000 })
```

## See also

`option.model.abilities`, `option.model.takes`, `option.model.voices`, `word.model`
