# `optimistic`

Tells a view whether a row is shown ahead of the answer of the change that made it, so that the view can draw it fainter.

## Example

```tsx
import { screen, read, optimistic, Form } from 'tentjs/ui'
import { addNote, notesOf } from '../functions/notes'

export const notesScreen = screen('notesScreen', {
  path: '/notes',
  access: 'signedIn',
  data: { notes: read(notesOf) },
  view: ({ notes }) => (
    <main>
      <ul>
        {notes.map((n) => (
          <li key={n.id} style={{ opacity: optimistic(n) ? 0.5 : 1 }}>
            {n.text}
          </li>
        ))}
      </ul>
      <Form call={addNote}>
        <input name="text" />
        <button type="submit">Add</button>
      </Form>
    </main>
  ),
})
```

`optimistic(row)` takes a row of what a query answered. A change whose body is plain is shown ahead of its answer: the page works its plan over the rows it holds, so a row it adds stands at once in each list it fits, and the page marks it until the answer comes, when the real row takes its place. `useCall(fn, { optimistic: false })` and `<Form optimistic={false}>` show nothing ahead.

## Returns

`true` for a row that the page shows ahead of its change's answer, and `false` for every other row and for anything that is no row.

## See also

`hook.useCall`, `tag.Form`, `topic.live`
