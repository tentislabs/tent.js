import { screen, upper, where } from 'tentjs/ui'

// A view that works values out with value words: the open orders of a list, and a word in capitals.
export const valuedScreen = screen('valuedScreen', {
  path: '/valued',
  access: 'anyone',
  title: 'Valued',
  view: () => (
    <div id="page" style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'start', padding: 16 }}>
      <span id="loud">{upper('quiet')}</span>
      {(where(
          [
            { id: 'a', status: 'open' },
            { id: 'b', status: 'paid' },
          ],
          { status: 'open' },
        )).map((row, place) => <span key={place} id="open">{row.id}</span>)}
    </div>
  ),
})
