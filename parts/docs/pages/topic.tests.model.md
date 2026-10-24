# A faked model

`app.fake(model, answers)` stands in for the provider of a model, so a test calls no AI. What it is faked with is one of three:

| `answers` | Is |
|---|---|
| A list of answers | Each answer is given to one step of one run, or to one call made outside a run, in the order they first ask. A step that runs again gets the answer it got before, and a call past the last answer fails with `code.T0013` |
| A function of the request | Handed the `ReplyRequest` (`adapter.Provider`): the instructions, the messages and the tools. It answers an answer, or a promise of one |
| A record of calls | `reply`, a list or a function as above; `embed(text)`, which answers a vector; `hear({ kind, language, hint })`, which answers `{ text }`; `speak(text)`, which answers the bytes of a sound; `rank(words, texts)`, which answers a score for each text; and `call(input)`, which answers the output of a model with `call` |

An answer is a record of what the model gives:

| Field | Is |
|---|---|
| `text` | What it writes |
| `calls` | The tools it asks for, each `{ tool, with }`: the name of the tool and its input |
| `value` | The typed answer, where the call states a shape |
| `reasoning` | What it reasons for itself, a text or a list of them |
| `parts` | How many parts a typed `value` arrives in, or the places it is cut at: 3 where it is left out |
| `units` | What the call used, as `{ tokensIn: 120, tokensOut: 40 }` |
| `fail` | The kind of `ProviderFailure` the call fails with, as a provider that is down: `fail: 'server'` is tried again and then given to the next model of `fallback`, as a real failure is |

```ts
const writer = app.fake('writer', [
  { calls: [{ tool: 'findInGuide', with: { words: 'reset a password' } }] },
  { text: 'Open Settings, then Password. (Help desk guide, page 2)' },
])
// ... a run of the agent, by `page.say` or a call
assert.equal(writer.sent[0].call, 'reply')
```

`writer.sent` is what the fake was sent, in order: `[{ call, input }]`, the key and the signal left out. A text is given as one part, so a page that shows an answer as it arrives shows a faked one whole; a typed `value` arrives in its `parts`, as the JSON of a typed answer does. A plain text in the place of an answer, and a generator of parts, are no answer: an answer is the record above.

A program that holds its own engine, as one of workspaces, fakes a model by handing the engine a provider of its own under the name of the model's provider, `createEngine({ makers: { providers: () => ({ anthropic: fake }) } })`, whose `reply` gives the parts of `adapter.Provider`.
