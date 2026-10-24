import { screen, read, Image } from 'tentjs/ui'
import { allTiles } from './functions'

export const boardScreen = screen('boardScreen', {
  path: '/board',
  access: 'anyone',
  title: 'The board',
  data: { tiles: read(allTiles) },
  view: ({ tiles, user }) => (
    <div style={{ display: 'flex', flexDirection: 'row', gap: 0, padding: 0, width: '100%', height: 300, background: '#ffffff' }}>
      {tiles.map((o) => <div key={o.id} style={{ width: 100, height: 100, background: o.color }} />)}
      {user !== undefined ? <>
        <div style={{ width: 100, height: 100, background: '#00ff00' }} />
      </> : null}
      <Image src="http://127.0.0.1:PICTURE_PORT/red.png" alt="A picture" width={100} height={100} />
    </div>
  ),
})
