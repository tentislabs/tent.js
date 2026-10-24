import { component, screen, text } from 'tentjs/ui'

export const Card = component('Card', {
  props: { title: text() },
  view: ({ title }) => <span>{title}</span>,
})

// A picture of a screen that only a signed-in person may see would show it to anyone a link reaches.
export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  seo: { image: { view: Card } },
  view: () => (
    <div>
      <span>Orders</span>
    </div>
  ),
})
