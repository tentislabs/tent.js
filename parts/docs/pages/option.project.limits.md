# `limits` of `project`

The limits of the app, each a default that the project changes.

## Value

A record from the name of a limit to a number, a size or a length of time, as `{ callSize: '2 MB' }`. A limit that is left out keeps its default.

Two of them bound how a page is drawn. `drawPasses` (5) is how many times the server draws a screen while what it reads cannot answer at once. `streamTime` (30 seconds) is how long a streamed page waits for its last part, after which the page asks what is still open once it has come alive (`topic.screens.streaming`). `loadingAfter` (200 ms) is how long a move inside the page waits before the loading component of the screen it leaves stands in its place (`option.screen.loading`).

## Example

```ts
export const shop = project('shop', {
  limits: { callSize: '2 MB', queryThreads: 4 },
})
```

## Errors

`code.T1003`: a name that is no limit.

`code.T1011`: a size or a length of time that does not read.

## See also

`word.project`, `topic.screens`
