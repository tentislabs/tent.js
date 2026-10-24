import { screen, asset, text, Image } from 'tentjs/ui'
import { Mark } from '../components/Mark'

export const boardScreen = screen('boardScreen', {
  path: '/board',
  access: 'anyone',
  state: { picked: text({ default: 'star.svg' }) },
  view: ({ state }) => (
    <main>
      <Image src={asset('star.svg')} alt="A star" width={24} height={24} />
      <Image src={asset(state.picked)} alt="Picked" width={24} height={24} />
      <Mark />
    </main>
  ),
})
