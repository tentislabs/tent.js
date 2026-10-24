import { component, screen, text } from 'tentjs/ui'

export const Filters = component('Filters', {
  state: { q: { type: text({ default: '' }), in: 'address' } },
  view: ({ state }) => <span>{state.q}</span>,
})

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  view: () => (
    <div>
      <Filters id="filters" />
      <Filters />
      <Filters id={`more${1}`} />
    </div>
  ),
})
