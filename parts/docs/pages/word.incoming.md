# `incoming`

A web call from outside that starts a flow. It is a helper word with a record of its own.

## Example

```ts
export const hookEvents = incoming('hookEvents', {
  path: '/hooks/in',
  then: nightly,
  verify: hooks.signature,
})
```

How a call is taken:

1. A call is a `POST` of `path`, a pattern like a route's that may hold values. Any other method there is not this definition's, so a screen, or a route of another method, may share the path, for a provider that first asks the address a question.
2. The signature is checked over the exact bytes that arrived, before anything of them is read. A wrong one is `code.T7118`, with status 401.
3. The size of a body is `callSize`, or `limits: { size }` of the definition. An address may send `limits.incomingPerMinute` (6,000) calls in a minute.
4. **A repeat is answered and does nothing.** In one write the engine notes the id of the call and adds the run of the flow that `then` names, which the system starts. A call whose id was noted adds nothing, and both are answered status 200 and `{ "ok": true }`, at once, before the flow has done anything. Ids are kept for `limits.incomingKept` (3 days). A scheme with no id, and an `open` call, knows no repeat; a scheme with an id and no time knows one only for as long as ids are kept.
5. The flow is handed `event`: `{ kind: 'incoming', id, headers, body, params, query }`. `body` is the JSON value where the call says it is JSON and reads as JSON, and the text as it arrived otherwise. `headers` holds every header by its name in small letters, but `authorization`, `cookie` and the header of the signature. `body` is `unknown` to the type checker, since its shape is the sender's: a plain flow hands it whole to a function whose input is `json()`, as `step('open', () => openTicket({ mail: event?.body }))`, and that function, which is code, reads each field it needs with a guard and checks it.
6. A secret with no value answers `code.T0009`, so the service tries again later, and the log names the secret.

## Options

| Option | Means |
|---|---|
| `option.incoming.path` | The address the call arrives at. |
| `option.incoming.then` | The flow that an incoming call starts. |
| `option.incoming.verify` | How the signature of a call is checked. |
| `option.incoming.open` | Takes calls that nobody signed, with the reason. |
| `option.incoming.limits` | The limits of a call. |
| `option.incoming.was` | The old name of the incoming call, where it was renamed. |

## Returns

A record that carries its options. Nothing calls it.

## See also

`topic.words`, `word.flow`, `word.verified`
