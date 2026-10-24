# T7109 request-too-large

A request holds more than its model takes, and is refused before it is sent: the status 400. Some servers cut a long request with no word, so it is held here.

## Details

The size is counted by the provider where it can count, and otherwise by a rule: one token for every 3 bytes of the text as UTF-8, and 1,500 for an image. What a model takes is in the list of its provider, or in `takes` of its definition. In a run with a conversation it is told as T7101, whose fix names `shrink`.

## The fix

Send less: a shorter text, fewer files, or a shorter conversation. A model that takes more states it in `takes`.

```ts
export const local = model('local', { provider: 'openai-style', name: 'qwen3', url: 'http://localhost:11434/v1', abilities: ['reply'], takes: 128000 })
```

## See also

`option.model.takes`, `adapter.Provider`
