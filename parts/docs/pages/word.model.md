# `model`

A model of any kind of AI, at its provider: one that writes, hears, speaks, makes vectors, or does any other work that a builder declares with types. It is always plain.

## Example

```ts
// models.ts
import { model, number, object, secret, text } from 'tentjs'
export const backup = model('backup', { provider: 'openai', name: 'gpt-5-mini', key: secret('OPENAI_KEY') })
export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY'), fallback: [backup] })

// functions/orders.ts, in an action, a route or a step of a flow
const summary = await writer.reply(`Summarise this order in one line: ${JSON.stringify(order)}`)
const { score, why } = await writer.fill({ score: number({ min: 0, max: 1 }), why: text() }, `Is this review angry? ${review}`)
for await (const part of writer.stream('Write a short welcome.')) show(part)
```

## Options

| Option | Means |
|---|---|
| `option.model.provider` | Who runs the model: `anthropic`, `openai`, `openai-style`, `google`, `service`, or one made in `engine.ts`. |
| `option.model.name` | The name of the model at its provider. |
| `option.model.key` | The secret the provider is called with. |
| `option.model.url` | The address of the provider's server, for `openai-style` and for a server of your own. |
| `option.model.abilities` | Which fixed calls the model has, for a model the list does not know. |
| `option.model.takes` | The most tokens one request may hold. |
| `option.model.voices` | The voices of a model that speaks. The first is its default. |
| `option.model.input` | What the model takes, for a model that is called as a function. |
| `option.model.output` | What the model gives, for a model that is called as a function. |
| `option.model.limits` | The most it may use in a day, for the app and for each caller, and how long a call may take. |
| `option.model.tries` | How often the same model is tried in all before the next one. |
| `option.model.fallback` | The models that a call goes to when this one cannot answer. |
| `option.model.hosted` | The provider's own tools that the model is offered. |
| `option.model.options` | What is passed straight to the provider in each request. |
| `option.model.countBy` | Counts the calls of the model for the app and not for each caller. |
| `option.model.call` | The call of a service that the model is made of, with the provider `service`. |
| `option.model.units` | Where the answer of the service says what was used. |
| `option.model.job` | Makes the model a long job that is asked about until it is done. |
| `option.model.was` | The old name of the model, where it was renamed. |

## Returns

The definition, with the six fixed calls. Each is called in an action, a route or a step of a flow, never in a query or a change (T0013), and answers a promise:

- `reply(prompt, { images, reasoning })`: the text of the answer. `images` are ids of files the caller may download; `reasoning` is a function that is handed the reasoning the model writes for itself, where its provider gives it, and `null` where the call began anew.
- `stream(prompt, { images, reasoning })`: the parts of the text as they arrive, read with `for await`. With `shape`, `stream(prompt, { shape })` gives parts of `{ value, text }`: each the whole value so far, with every field that has not come yet left out, and beside it the text so far. An object or a list still open is closed where it stands, a text that is cut is given as far as it has come, and a number or a word that may not be whole is left out until what follows it has come. The last part is the answer, checked as `fill` checks one: one that does not fit ends the stream with `code.T7108`, and one that was cut off with `code.T7107`, after the parts that were given, and neither goes to a model of `fallback`.
- `fill(shape, prompt, { images, reasoning })`: a value of that shape, one type or a record of types. An answer that does not fit is asked for once more with the error. A date of it is the text of the moment.
- `embed(text)`: a vector; a list of texts gives a list of vectors.
- `hear(file, { language, hint })`: `{ text, language, seconds }` of a recording.
- `speak(text, { name, format, speed })`: the id of a file that holds the sound. `format` is `mp3` (the default), `wav` or `opus`.

A model that states `input` and `output`, or a `call` of a service, is also a function: `await painter({ prompt })`. Its input is checked before the call and its answer after it; a `file` of the input reaches the provider as its bytes, and one of the answer comes back as the id of a file of the caller.

On a failure of its server a call is tried again, and then handed to each model of `fallback` that can do it. Every try is counted and logged, and a try that its provider failed is also a line of `tent logs --errors` under the name of the model, with what the provider said: so the log says why a model failed where the next one answered. A call inside a step that is a long job is kept, so the step goes on with the same job after a restart.

## Errors

- `code.T7001`: the model is asked for something it cannot do.
- `code.T0002`: what a model that is a function was handed does not fit its `input`.
- `code.T7104`: every model that could answer failed; the message names each.
- `code.T7106`: the model refused.
- `code.T7107`: the answer was cut off.
- `code.T7108`: the answer did not fit its shape or its `output`.
- `code.T7109`: the request holds more than the model takes.
- `code.T7110`: the provider did not accept the request, or refused the key.
- `code.T7113`: the model names a provider that neither ships nor was made.
- `code.T0013`: it was called in a query or a change.
- `code.T0010`: it was called with no engine: nothing stands in the runtime slot.

## See also

`adapter.Provider`, `topic.words`
