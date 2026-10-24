# T6018 lives-in-the-browser

A component that is drawn on the server alone holds what lives in the browser, or its file gives something else beside such components.

## Details

A component that states `browser: false` is drawn on the server, and the browser never loads its code. So it holds nothing that needs that code in the browser:

| Mistake | Example |
|---|---|
| A declared state, or `set` | `state: { open: { type: boolean() } }` |
| A `Form`, or `useField` | `<Form call={addNote}>` inside it |
| A hook | `useState(0)`, `useQuery(orders)` |
| An event handler | `<button onClick={open}>` |
| Another export of its file | `export const helper = ...` beside it |

What lives in the browser may stand among its living children: its `children`, and every property whose value is an element, which the screen that uses it gives.

## The fix

Move what lives in the browser into the screen, or into a component that is drawn in the browser, and hand it in as a child. Give the component a file of its own.

## See also

`option.component.browser`, `word.component`
