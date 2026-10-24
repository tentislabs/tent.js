import { screen, asset, text, Image } from 'tentjs/ui'

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'signedIn',
  state: { photo: text({ default: '' }) },
  view: ({ state }) => (
    <div>
      <Image src={asset('poster.png')} alt="Sized by its file" />
      <Image src={state.photo} alt="A photo" width={240} height={160} />
      <Image src={state.photo} alt="One side of it" width={240} />
    </div>
  ),
})
