import { useEffect, useState } from 'react'
import { screen, text, Link } from 'tentjs/ui'

// A page that needs two entries of `unlock`: a style tag of its own, and code that is made from text.
export const unlockedScreen = screen('unlockedScreen', {
  path: '/unlocked',
  access: 'anyone',
  view: () => {
    const [made, setMade] = useState('waiting')
    useEffect(() => {
      try {
        setMade(String(new Function('return 6 * 7')()))
      } catch {
        setMade('refused')
      }
    }, [])
    return (
      <main>
        <style>{'#styled { color: rgb(1, 2, 3) }'}</style>
        <p id="styled">Styled by a tag of the page</p>
        <p id="made">{made}</p>
        <Link to={linkedScreen} with={{ id: '7', tab: 'open' }}>
          To the linked one
        </Link>
      </main>
    )
  },
})

// A screen that the one above goes to, which stands after it in the same file.
export const linkedScreen = screen('linkedScreen', {
  path: '/linked/:id',
  access: 'anyone',
  state: { tab: { type: text({ default: 'all' }), in: 'address' }, kept: text({ default: '' }) },
  view: ({ params }) => (
    <div>
      <span>Linked {params.id}</span>
      <Link to={unlockedScreen}>Back</Link>
    </div>
  ),
})
