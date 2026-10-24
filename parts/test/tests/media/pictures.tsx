import { screen, asset, read, text, Image } from 'tentjs/ui'
import { allPhotos } from './functions'

// Pictures: an asset sized by its file, assets named by values of the state, a picture on the listed site and one
// on a host that is not listed, and the photos that visitors handed in.
export const picturesScreen = screen('picturesScreen', {
  path: '/pictures',
  access: 'anyone',
  title: 'Pictures',
  data: { photos: read(allPhotos) },
  state: {
    named: text({ default: 'scene.png' }),
    missing: text({ default: 'nothing.png' }),
    listed: text({ default: 'SITE/listed.png' }),
    away: text({ default: 'AWAY/away.png' }),
  },
  view: ({ state, photos }) => (
    <main>
      <Image id="fixed" src={asset('scene.png')} alt="A scene" sizes="80px" />
      <Image id="named" src={asset(state.named)} alt="A scene by its name" width={80} height={40} />
      <Image id="missing" src={asset(state.missing)} alt="No such scene" width={80} height={40} />
      <Image id="listed" src={state.listed} alt="On the listed site" width={40} height={40} />
      <Image id="away" src={state.away} alt="On another host" width={40} height={40} />
      <ul>
        {photos.map((p) => (
          <li key={p.id}>
            <Image className="photo" src={p.photo} alt={p.title} width={80} height={40} priority />
          </li>
        ))}
      </ul>
    </main>
  ),
})
