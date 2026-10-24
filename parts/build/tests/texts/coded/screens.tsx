import { screen } from 'tentjs/ui'

export const homeScreen = screen('homeScreen', {
  path: '/',
  access: 'anyone',
  view: () => <h1>Home</h1>,
})

// The path starts with the code of a language of the project.
export const turkishScreen = screen('turkishScreen', {
  path: '/tr/orders',
  access: 'anyone',
  view: () => <h1>Orders</h1>,
})
