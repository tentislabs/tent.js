import { screen } from 'tentjs/ui'

export const homeScreen = screen('homeScreen', {
  path: '/',
  access: 'anyone',
  title: 'Home',
  view: () => <h1>Home</h1>,
})

export const orderScreen = screen('orderScreen', {
  path: '/orders/:id',
  access: 'anyone',
  title: 'An order',
  view: ({ params }) => <h1>Order {params.id}</h1>,
})

export const newOrderScreen = screen('newOrderScreen', {
  path: '/orders/new',
  access: 'anyone',
  title: 'A new order',
  view: () => <h1>A new order</h1>,
})

export const docsScreen = screen('docsScreen', {
  path: '/docs/*',
  access: 'anyone',
  title: 'The docs',
  view: ({ params }) => <h1>Docs {params.rest}</h1>,
})

// The bare address of the rest above: a screen of its own stands there.
export const docsIndexScreen = screen('docsIndexScreen', {
  path: '/docs',
  access: 'anyone',
  title: 'The index of the docs',
  view: () => <h1>The index of the docs</h1>,
})

export const lostScreen = screen('lostScreen', {
  for: 'notFound',
  access: 'anyone',
  title: 'Lost',
  view: () => (
    <main>
      <h1>Nothing is here</h1>
    </main>
  ),
})

export const brokeScreen = screen('brokeScreen', {
  for: 'error',
  access: 'anyone',
  title: 'Broken',
  view: ({ error }) => (
    <main>
      <h1>Our own error page</h1>
      <span id="code">{error ? error.code : 'none'}</span>
    </main>
  ),
})
