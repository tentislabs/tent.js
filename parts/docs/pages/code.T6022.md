# T6022 name-twice-in-view

A use of a component that keeps state in the address, with no `id` written in place.

## Details

What a use of a component keeps in the address is kept under the `id` of the use. With no `id` written in place, two uses of it, or a use on another screen, would read one another's state.

```tsx
export const Pager = component('Pager', {
  state: { page: { type: number({ default: 1 }), in: 'address' } },
  view: ({ state }) => <span>Page {state.page}</span>,
})

<Pager />               // T6022
<Pager id="orders" />
```

## The fix

Give the use an `id` written in place.

## See also

`word.component`, `option.component.state`
