import { screen, text, Image } from 'tentjs/ui'

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  state: { photo: text({ default: '' }) },
  view: ({ state }) => (
    <div>
      <Image src={state.photo} alt="A photo" />
      <Image src="https://pictures.example.com/a.png" alt="An address" />
    </div>
  ),
})
