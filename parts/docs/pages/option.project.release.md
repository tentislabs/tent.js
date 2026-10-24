# `release` of `project`

How a new version reaches the visitors: all at once, or gradually, to a share of them first, watched against the version that runs and widened step by step or taken back by itself.

## Value

`{ gradual, steps, every, watch }`. `gradual: true` makes every publish gradual, as `tent publish --gradual` makes one. `steps` are the shares of the callers the new version is given, `[0.05, 0.25, 1]` when left out, and `every` the time at each step, `'10 minutes'`. A caller is given a version by a fingerprint of their id against the release: a visitor by the id of their cookie, a signed-in person by their user id, a key by its id, so the same person stays on one version through the release, on every machine. A page keeps the version it was drawn with, and a run the version it started on.

`watch` holds the new version to the old one over each step: it is taken back where its share of the calls that fail for no fault of the caller passes the old one's by `failures` (0.01), or where it answers slower at the 95th share by `slower` (a fifth, 0.2), once each version had `calls` calls (200) in the step. Otherwise it is widened at the end of its step. A release taken back switches every visitor to the old version, keeps the new one loaded for the runs that started on it, and writes why, with the numbers of both, into the log and into the note of its point.

## Example

```ts
export const shop = project('shop', {
  release: { gradual: true, steps: [0.1, 0.5, 1], every: '30 minutes', watch: { calls: 500 } },
})
```

## Errors

`code.T9108`: a version whose table change is hard cannot go gradually.

## See also

`word.project`, `command.publish`
