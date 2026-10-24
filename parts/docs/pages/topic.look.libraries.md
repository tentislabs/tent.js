# Icons, charts and large libraries

This page says how icons, charts, Markdown, dialogs and long lists come in, what a large library that only draws needs, and what a page weighs.

## Icons, charts, Markdown, dialogs and long lists

Each is a package of its own, written as its documents give it:

| Thing | A package that does it |
|---|---|
| Icons | `lucide-react`, or an SVG file of the project's assets |
| Charts | Recharts; one that draws on the server, as visx, where the first HTML must hold the chart |
| Markdown | `marked` or `react-markdown` |
| Dialogs, menus, popovers | Radix UI, or the browser's own `<dialog>` and `popover` |
| Long lists | TanStack Virtual |

A picture of the app is `tag.Image`. A recording is the browser's own `<video>` and `<audio>`, and a frame of another site a plain `<iframe sandbox>` whose host `unlock.frames` lists.

## A large library that only draws

A part that only draws and never answers a press - text made from Markdown by a large library, a chart, colored source code - is a component that states `browser: false`: the server draws it, its HTML is in the first page, and the browser loads none of its code nor any package that only it imports, while its style files load as those of any component. Its `children` and every property whose value is an element stay alive in the browser, so it can wrap a button without holding one (`option.component.browser`).

## Weight

A heavy library makes a page heavier: `tent map` and `tent build` tell the bytes of each screen and each style file in the page, and nothing is refused for its size.

## See also

`topic.screens`, `hook.useNonce`, `option.project.html`, `option.project.head`, `option.screen.state`, `option.component.browser`, `tag.Image`, `command.shot`
