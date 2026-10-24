# A screen in a chat

A screen that states `offer: ['mcp']` is offered to a chat app too, to be drawn in a frame of its own, by the standard's extension for that. A chat app may draw it or not, so the text of its tool holds the screen's data, which is all its model is given, and says the screen is offered, never that it is shown. It states `about`, which is its tool's description (`code.T7009`).

```tsx
export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  about: 'The orders of the person, with a form that adds one',
  offer: ['mcp'],
  data: { orders: read(openOrders) },
  view: ({ orders }) => (
    <ul>
      {orders.map((one) => (
        <li key={one.id}>{one.title}</li>
      ))}
    </ul>
  ),
})
```

1. **The file.** The build writes one file for the screen in each language of the project, `mcp/<screen>.<language>.<fingerprint>.html`, which holds everything inside it: the page code in its form for one file, the records of the screen and of its components, the modules of their views, their styles and its words. Pictures and fonts are loaded from the app's own address, which the layer writes into the file when a chat app reads it, under `ui://<app>/<file>`.
2. **Its tool** is named after the screen, only reads, and is listed whatever `toolsListed` says and under `mcp: { only: 'queries' }`. Its input is the values of the screen's address and the states it keeps there. It answers what a page of that address would be drawn with, as the caller: a sign-in, a screen that is not found and an error are the tool's error. The model is told that the screen is offered, with the answers of its data by the name of what each read; the record of the page goes to the frame alone, with a pass.
3. **In the frame** the screen is drawn as on a page, and reaches the app through the chat app: a `read`, a `useCall` and a `Form` are calls of the function's tool, so each function the screen reads or calls is offered to MCP too (`code.T7021`), and is found by its name whatever `toolsListed` says. A function that only such screens use is told to the chat app as callable by the frame alone (`_meta.ui.visibility: ['app']`): it costs the model nothing, and `findFunction` does not answer it. After a call that worked the screen's tool is asked again. A `Link` and an `href` of `then` ask the chat app to open the address in the browser. An answer of another version than the file shows the line that the view is out of date.
4. **The pass.** Each answer of the screen's tool brings a pass for its frame, good for `limits.askTime`: the caller's user, narrowed to the queries and the files that the answer named, an upload where that caller could upload, and the live connection. Where the chat app lets the frame connect to the app, the frame sends it with a picture, a download, an upload and the live connection, and the screen is live as anywhere. Where it does not, the frame asks its tool again every `limits.frameAsk` (30 seconds). A request with a pass and no cookie is not held to the `Origin` rules, since no other site can send it.
5. **What a frame of another site does in its own way**, each a warning of `code.T7021`: a state kept in the device or in the browser starts at its default there, so a screen offered to MCP keeps it in the page or in the address; a script that `unlock` lists is not loaded there, so the screen draws what it shows with its own tags; and a member of an agent or `working` is no tool, so the screen calls a function, which the chat app offers as one.

A project with such a screen answers the standard's `resources/list` and `resources/read` by itself.
