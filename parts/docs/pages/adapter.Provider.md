# `Provider`

What speaks to an AI's server: one request to one model. Five ship - `anthropic`, `openai`, `openai-style`, `google` and `service` - and a builder adds another for any kind of AI, which a model then names in `provider`.

## Interface

```ts
interface Provider {
  reply?(o: ReplyRequest): AsyncIterable<ReplyPart>
  size?(o: ReplyRequest): number | Promise<number>
  embed?(o: Base & { texts: string[] }): Promise<{ vectors: number[][]; units?: Units; raw?: unknown }>
  hear?(o: Base & { audio: Uint8Array; kind: string; language?: string; hint?: string }): Promise<{ text: string; language?: string; seconds: number; units?: Units; raw?: unknown }>
  speak?(o: Base & { text: string; voice?: string; format: 'mp3' | 'wav' | 'opus'; speed?: number }): Promise<{ audio: Uint8Array; units?: Units; raw?: unknown }>
  rank?(o: Base & { words: string; texts: string[] }): Promise<{ scores: number[]; units?: Units; raw?: unknown }>   // one score for each text, higher where it fits the words better
  call?(o: Base & { input: unknown }): Promise<{ output: unknown; units?: Units; raw?: unknown }>
  begin?(o: Base & { input: unknown }): Promise<{ job: string }>
  check?(o: Base & { job: string }): Promise<{ wait: number } | { output: unknown; units?: Units; raw?: unknown }>
}
interface Base { model: object; key?: string; fetch: GuardedFetch; signal: AbortSignal; at?: { run: string; step: string; repeat: number } }
interface ReplyRequest extends Base {
  instructions?: string
  messages: { who: 'user' | 'assistant' | 'tool'; text?: string; images?: { bytes: Uint8Array; kind: string }[]
              calls?: { id: string; tool: string; input: unknown }[]; id?: string; result?: unknown; error?: string; keep?: unknown }[]
  tools?: { name: string; about: string; input: object }[]
  shape?: object
}
type ReplyPart = { text: string } | { reasoning: string }
  | { end: { text: string; calls: { id: string; tool: string; input: unknown }[]; value?: unknown; units?: Units; raw?: unknown; keep?: unknown } }
type Units = Record<string, number>
```

A provider has the members for what its models can do, and no others: a call that needs a member it lacks fails with T7001. Everything else is the model layer's, and the same for every provider: checking the input and the answer, the limits, a second provider, storing files, the counting and the log.

- `reply` serves `reply`, `stream` and `fill`. It gives each part of the text as it arrives, the reasoning the model writes for itself as `reasoning` parts, and one `end` with the whole text, the tools the model asked for, and what the call used. `shape` asks for a typed answer: give its JSON as the text, or the value in `end.value` where the server read it.
- `model` is the model's record from the description, with `name`, `url` and `options`. `key` is the value of its secret. Make every request with `fetch`, the guarded fetch, and end it when `signal` ends.
- `units` is what the call used, by unit: `tokensIn` and `tokensOut` for a model that writes, or whatever your server charges by, as `images`. A unit you do not report is counted by the layer's rule. Report none under a name of the engine's own, such as `bytesOut`: it is left out.
- `end.keep` is what your server needs handed back unchanged with the next request of the same run: it comes back as `keep` on that message, to your model alone.
- `begin` and `check` are a long job: `begin` starts the work, and `check` is asked after the `wait` it names, in milliseconds, until it gives the result. Inside a step the job is kept, so a step that runs again goes on with it.
- `size`, where you have it, is your own count of a request in tokens: one over the model's `takes` is refused before it is sent (T7109).
- Say how a call failed by throwing a `ProviderFailure` from `tentjs/engine`: `new ProviderFailure(kind, message, { retryAfter })`. `busy` and `server` are tried again and then given to the next model; `unreachable` and `slow` go to the next model; `notAccepted` is T7110, `refused` T7106 and `cutOff` T7107. Any other error counts as `server`.

`Provider`, `ReplyRequest`, `ReplyPart` and `Units` are declared in `tentjs/ai`, which `tentjs/engine` gives again with `ProviderFailure`. A model that names a provider that neither ships nor was made stops the app from opening (T7113). In a test, `app.fake(model, answers)` stands in for a provider, with the answers that `topic.tests.model` gives under "A faked model": an answer with `fail`, as `{ fail: 'busy' }`, fails as a `ProviderFailure` of that kind does, so a test makes a provider that is down without one of its own.

## Example

```ts
// models/painter.ts
export const painter = model('painter', { provider: 'pictures', name: 'flux-pro', input: { prompt: text() }, output: object({ picture: file() }) })

// engine.ts
import type { Makers, Provider } from 'tentjs/engine'
import { ProviderFailure } from 'tentjs/engine'
export default {
  providers: ({ secrets }) => ({
    pictures: {
      async call(o) {
        const answer = await o.fetch('https://pictures.example.com/v1/make', {
          method: 'POST',
          headers: { authorization: `Bearer ${secrets.PICTURES_KEY.reveal()}`, 'content-type': 'application/json' },
          body: JSON.stringify(o.input),
          signal: o.signal,
        })
        if (answer.status === 429) throw new ProviderFailure('busy', 'Too many pictures at once.')
        const made = await answer.json()
        return { output: { picture: { url: made.address } }, units: { images: 1 } }
      },
    } satisfies Provider,
  }),
} satisfies Makers
```

## See also

`word.model`, `option.model.provider`, `topic.tests`, `code.T7113`, `code.T7001`
