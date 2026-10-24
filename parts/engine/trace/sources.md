# What tracing was built against

The ids of a trace and of a span, the header that carries them, and the form in which spans, lines and errors are sent out are each a standard's. `ids.ts` reads and writes the header, and `export.ts` writes the form.

Written on 2026-10-16, on a computer that may reach no address outside it: the pages below were not opened for this writing. What the code holds is the plain reading of each page as it stood at the last reading of the builder, and each name is to be held against the pages at the next reading.

| What | Page |
|---|---|
| `traceparent`: the version `00`, a trace id of 32 hex characters and a span id of 16, neither all zeros, the flags, and `ff` as no version | https://www.w3.org/TR/trace-context/ |
| The protocol over HTTP: a `POST` of JSON to `<address>/v1/traces` and `<address>/v1/logs`, answered 200 where it was taken | https://opentelemetry.io/docs/specs/otlp/ |
| The JSON form: the ids written as hex and not as base64, the times as nanoseconds since 1970 in a text, a whole number as a text | https://opentelemetry.io/docs/specs/otlp/#json-protobuf-encoding |
| A span: `traceId`, `spanId`, `parentSpanId`, `name`, `kind` (1 inside, 2 a request that came in, 3 one that went out), `startTimeUnixNano`, `endTimeUnixNano`, `attributes`, `status` (1 worked, 2 failed) | https://github.com/open-telemetry/opentelemetry-proto/blob/main/opentelemetry/proto/trace/v1/trace.proto |
| A line: `timeUnixNano`, `severityNumber` (5 debug, 9 info, 13 warn, 17 error), `severityText`, `body`, `attributes`, `traceId`, `spanId` | https://github.com/open-telemetry/opentelemetry-proto/blob/main/opentelemetry/proto/logs/v1/logs.proto |
| The name of what made them: `service.name` and `service.version` of the resource | https://opentelemetry.io/docs/specs/semconv/resource/ |
