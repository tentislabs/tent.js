# `vitals` of `project`

How much of the speed real visitors see is measured.

## Value

`{ share }`: the share of the page views that are measured, from 0 to 1, 0.1 where it is left out; 0 measures none. A page that is measured loads a small part of the page code once the browser is idle, so it costs nothing at its start, and takes the browser's own measures: the time to the largest content, the delay of a press, the shift of the layout, the time to the first byte, and the time of each move between screens. It sends them once, when the page is hidden, to `/_t/vitals`.

The engine keeps them in the table `vitals` of its log, with the screen, the version, the kind of device by the width of the window, and the kind of connection: nothing that says whose visit it was. It takes them from a page of the app's own origin alone, holds each value to the range its measure can have, and takes `limits.vitalsPerMinute` (60) from one address. `tent logs --vitals` shows, for each screen, the 75th share of each measure over a day against the line of good for it, the screens furthest past their line first, each version beside the one before. With `trace.otlp` they are sent out as metrics too.

## Example

```ts
export const shop = project('shop', { vitals: { share: 0.25 } })
```

## See also

`command.logs`, `option.project.trace`, `word.project`
