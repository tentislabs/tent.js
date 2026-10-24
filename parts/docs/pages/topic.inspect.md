# The inspect mode

A page in the inspect mode tells a visual tool which element is pointed at, and the place of the tag in the screen file that drew it, and takes a few orders from it: picking an element, a frame around an element, the tree of elements, and a move. It is what a tool builds its pointing on; the framework ships no such tool.

## Giving a tool a page

The program that holds the app asks for a token, and the tool opens the address of a screen with it:

```ts
const token = app.inspect({ framedBy: 'http://localhost:5173' })
// the tool shows http://localhost:3000/orders?t-inspect=<token> in a frame
```

`framedBy` is the origin of the pages of the tool: a scheme, a host and a port, and nothing else - a semicolon, a star, a quote, a comma, a space or a path is `code.T0002`. A tool that opens the page in a window of its own names its origin as `{ opener: 'http://localhost:5173' }`: the page is framed by nobody, posts to that origin alone, and reads a message only from the window that opened it while that window stands on that origin, so a window of the tool that goes to another site is told nothing more. The token holds for an hour, or for `for`: `app.inspect({ framedBy, for: '30 minutes' })`. On a computer of your own, `tent dev --inspect http://localhost:5173` prints such an address (`command.dev`). A token is kept in the memory of the engine: it opens nothing on another app, and is gone when the app is closed.

Where the token holds, the engine lets that origin show this one answer in a frame, writes `inspect: { origin }` into the record of the page, and the page loads the part of the page code that speaks to the tool. Such a page is drawn afresh and kept by no cache. The page takes the token out of its address at once, keeps the mode through every move, and puts the token back on an address of the app that it loads whole, as after a save that asks for a reload, or a move to a screen that another `framedBy` frames. A form that is sent with no script carries it too. A way to the sign-in screen carries it as a name of its own, never inside `back`. A page with no good token loads no such part and answers no message, and may be shown in no frame of the tool. The screens where a person lets a program in, `grant` and `ask`, are opened by no token.

A tool on another site is sent no cookie of the app by the browser, so it sees what nobody sees: `cookies: { sameSite: 'none', domain }` in `project` keeps a sign-in there (`topic.users`). A tool on the same site sees the page as its signed-in user.

## The messages

They go by the browser's own messaging between the page and the window that holds it, or that opened it. The page posts to the origin of the token alone, and reads a message only when it came from that origin and from that window.

| From | Message | Meaning |
|---|---|---|
| Page | `{ t: 'tent.ready', screen, path, version }` | The page has come alive, or shows another screen |
| Page | `{ t: 'tent.over', element }` | The pointer is over another element. With no `element`: over none |
| Page | `{ t: 'tent.picked', element }` | An element was pressed while picking is on |
| Page | `{ t: 'tent.tree', elements }` | The answer to `tent.tree`: every element that is drawn, each with the elements inside it |
| Tool | `{ t: 'tent.pick', on }` | Picking on or off. While it is on, a press picks and does nothing else: no call and no move |
| Tool | `{ t: 'tent.highlight', place, uses, color }` | Draws a frame around the element of that place, in the color. With no `place`, the frame is taken away |
| Tool | `{ t: 'tent.tree' }` | Asks for the tree |
| Tool | `{ t: 'tent.goTo', path }` | Moves the page to a path of the app. A path that ends in `#<id>` scrolls that element into view, and a state in the address shows the page as that state has it |

What comes from the tool is held to its form before it finds an element: a `place` to the form below, and a `color` to the form of a color of CSS - `#` and 3, 4, 6 or 8 hex digits; one of `rgb()`, `hsl()`, `hwb()`, `lab()`, `lch()`, `oklab()`, `oklch()` and `color()`, holding only letters, digits, spaces, `.`, `,`, `%`, `/`, `+` and `-`; or one of the color names of CSS - and a `path` to a path of the app. A message of another form finds nothing and sets nothing.

## An element

An element is told as `{ view, place, uses, tag, rect }`:

| Field | Holds |
|---|---|
| `view` | The screen or the component whose file wrote it |
| `place` | The file and the first and last character of the tag that drew it there, its closing tag with it: `{ file: 'screens/orders.tsx', from: 120, to: 188 }`, as `places` of the description writes a definition's. An element that a library's component draws is told by the tag of the screen file that used the component |
| `uses` | The places of the uses of components that it is drawn inside, from the screen inwards, so two uses of one component are told apart |
| `tag` | The name of the tag: `li`, `Link`, `PriceTag` |
| `rect` | Where it lies in the window: `{ x, y, width, height }` |

The places are known in a development build, from React's own development data, so no element is added to the page. A release build tells nothing: a tool that edits screens works on a development build. What an element is told is what a turn of the project tools takes in `at`. The page tells what it is, and nothing more: the names of tags, their places, where they lie, and the path. It reads no value of a row and makes no call.

## See also

`topic.engine`, `topic.screens`, `topic.history`, `command.dev`
