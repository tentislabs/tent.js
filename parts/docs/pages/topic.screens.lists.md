# A list with a search and pages

A searched list is one query and one screen. The query takes the words with `default: ''`, since an empty text finds every row, and the cursor of `after` as optional, which the first page is asked without:

```ts
// tables/orders.ts states search: { columns: ['name'], by: 'pieces' }
export const ordersPage = query('ordersPage', {
  input: { words: text({ default: '', max: 100 }), after: text({ optional: true }) },
  access: role('staff'),
  rows: orders.search(input('words')).newest('createdAt').limit(20).after(input('after')),
})
```

The screen keeps both in its address, so a reload and a link someone was sent show the same rows. The box calls `set` at each change, which writes the words into the address with no reload and asks the query again; `reset` starts the pages anew when the words change. "Next page" carries `next` into the address, and `back: true` makes each page a step of the browser's history, so the back button is the way to the page before:

```tsx
export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: role('staff'),
  state: {
    words: { type: text({ default: '', max: 100 }), in: 'address' },
    after: { type: text({ optional: true }), in: 'address', back: true, reset: ['words'] },
  },
  data: ({ state }) => ({ page: read(ordersPage, { words: state.words, after: state.after }) }),
  view: ({ page, state, set }) => (
    <main>
      <h1>Orders</h1>
      <input aria-label="Search" type="search" value={state.words} onChange={(e) => set({ words: e.target.value })} />
      <ul>
        {page.rows.map((o) => (
          <li key={o.id}>{o.name}</li>
        ))}
      </ul>
      {page.next && (
        <Link to={ordersScreen} with={{ words: state.words, after: page.next }}>
          Next page
        </Link>
      )}
      <Link to={ordersScreen} with={{ words: state.words, after: undefined }}>
        First page
      </Link>
    </main>
  ),
})
```

The link to the first page names `after` as `undefined`, so it is current on the first page alone (`tag.Link`). Each change of the words asks the query once: a view that should ask only once the typing has stopped keeps what is typed in React, `useState`, and calls `set` from a `setTimeout` of a few hundred milliseconds that each key starts anew, as any React search box does. `option.table.search` says what a word finds, by words or by pieces.
