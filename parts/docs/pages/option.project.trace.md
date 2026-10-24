# `trace` of `project`

Which traces of the app are kept, and where they are sent out. A trace is the tree of timed spans of one thing that happened: a request, a press on a page with all it set off, a run, a task on a worker.

## Value

`{ share, otlp }`. `share` is the part of the traces that is kept where nothing in them asks it, from 0 to 1, chosen by the id of the trace, so that every machine keeps the same ones: 0.1 on live data and 1 on test data where it is left out. A trace that holds an error, or a span longer than `limits.slowSpan` (500 ms), is kept whole whatever the share says. Spans are kept for `limits.traceKeep` (7 days), in the table `spans` of the log.

`otlp` names an address that takes the OpenTelemetry protocol over HTTP, `{ url, headers? }`, each a text, a `setting` or a `secret`. The engine sends the spans it keeps there in batches, to `<url>/v1/traces`, and the lines and errors of the log to `<url>/v1/logs`, each with its trace, through the guarded fetch. What cannot be sent stays in the log, and is not tried again once it is older than `limits.traceKeep`.

A span holds names, counts, sizes, times and codes, and never an input, an answer, a value of a row, a secret, a token or a cookie, so a trace may be sent where the data of the app may not.

## Example

```ts
export const shop = project('shop', {
  trace: { share: 0.2, otlp: { url: setting('otlpUrl'), headers: { authorization: secret('OTLP_TOKEN') } } },
})
```

## Errors

`code.T1014`: a `share` that is no number from 0 to 1.

## See also

`word.project`, `command.logs`, `word.setting`, `word.secret`
