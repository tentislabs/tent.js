# `api` of `project`

What the app states for the API.

## Value

`{ names, headers, origins }`: a record from a function to the name it is offered under, more headers a listed site may send, and the sites that may call. Left out, a function is offered under its own name and no other site may call.

A function that states `offer: ['api']` is reached at `/api/<name>`: a query by `GET`, with its input after the question mark, or by `POST`, and every other kind by `POST`, with its input as one JSON object. It answers the value itself with 200, or 204 where it answers nothing, and a failure as the standard form of a problem, `application/problem+json`. A function that states `deprecated` answers with `Sunset`, and a refusal by a count with `Retry-After`. A request from a page of a site that `origins` does not list is `code.T0004`, a read too; the question a browser asks first, an `OPTIONS`, is answered for a listed site with that site named. `/api/openapi.json` and `/api/docs` describe what is offered, to the callers that `describeTo` lets in. A route of the builder's own may lie under `/api/`, and is tried first.

A change or an action sent with the standard header `Idempotency-Key` runs once for its caller and that key: sent again within `limits.callIdKeep` (one day), it is answered with what it answered the first time, and is not run again, so a program may send a call again whose answer it lost. The same key with another input is `code.T0002`. A read keeps no key.

## Example

```ts
export const shop = project('shop', {
  api: { names: { countNotes: 'notes' }, headers: ['X-Shop'], origins: ['https://www.example.com'] },
})
```

## See also

`word.project`
