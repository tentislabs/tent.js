import { asset, Image, read, screen, text, useTranslations } from 'tentjs/ui'
import { greeting } from './functions'

// A screen with a state that the page alone keeps, a view that calls a hook, and an entry that reads the state.
export const homeScreen = screen('homeScreen', {
  path: '/',
  access: 'anyone',
  state: { name: { type: text({ default: '' }) } },
  data: ({ state }) => ({ greeting: read(greeting, { name: state.name }) }),
  view: ({ greeting, set }) => {
    const { t } = useTranslations()
    return (
      <main>
        <h1>{greeting}</h1>
        <p>{t('lead')}</p>
        <button type="button" onClick={() => set({ name: 'Ada' })}>
          Name
        </button>
      </main>
    )
  },
})

// A picture of the assets, which the image door serves.
export const pictureScreen = screen('pictureScreen', {
  path: '/picture',
  access: 'anyone',
  view: () => (
    <main>
      <Image src={asset('a.png')} alt="A picture" />
    </main>
  ),
})
