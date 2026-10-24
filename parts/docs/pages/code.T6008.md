# T6008 direct-call

A screen file calls a function of the backend directly.

## Details

A screen file imports a query, a change or an action from a backend file, and holds it by its name alone: in the browser it is a record with its name and its kind, and no function. So a call that is written straight into a screen file can never work.

```tsx
const rows = openOrders({ limit: 10 })                 // T6008
<button onClick={() => markPaid({ order: id })}>       // T6008
```

A screen reaches a function through the door, which checks its rule for the caller.

## The fix

Hand the definition to what calls it by its name:

- a query: an entry of `data`, `read(openOrders, { limit: 10 })`, or `useQuery(openOrders, { limit: 10 })` in the code of a view;
- a change or an action: a `Form`, `<Form call={markPaid} with={{ order: o.id }}>`, or `useCall(markPaid)` in the code of a view. An action may be read as an entry of `data` too.

## See also

`topic.screens`, `word.read`, `hook.useQuery`, `hook.useCall`, `tag.Form`
