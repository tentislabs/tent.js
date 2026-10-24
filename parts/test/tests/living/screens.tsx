import { useEffect } from 'react'
import { screen, read, role, useCall, useQuery, Form } from 'tentjs/ui'
import { addCard, allCards, cardPage, dropCard, keepCard, quietCards, quote, staffCards } from './functions'

// A screen that reads an action: each request for it calls the action once.
export const quoteScreen = screen('quoteScreen', {
  path: '/quote',
  access: 'anyone',
  data: { quote: read(quote) },
  view: ({ quote }) => <h1>Quote {quote}</h1>,
})

// A screen that shows a live list, with a press that adds to it.
export const cardsScreen = screen('cardsScreen', {
  path: '/',
  access: 'anyone',
  data: { cards: read(allCards) },
  view: ({ cards }) => (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h1>{cards.length} cards</h1>
      {cards.map((card, place) => <span key={place}>{card.title}</span>)}
      <Form call={addCard} with={{ title: 'Pressed', rank: 500 }}><button type="submit">
        Add one
      </button></Form>
    </main>
  ),
})

// The first page of the cards, three at a time.
export const pageScreen = screen('pageScreen', {
  path: '/page',
  access: 'anyone',
  data: { page: read(cardPage, {}) },
  view: ({ page }) => (
    <main>
      {page.rows.map((card, place) => <span key={place}>{card.title}</span>)}
    </main>
  ),
})

// A list that is never live: it is asked again after a call of the page that worked.
export const quietScreen = screen('quietScreen', {
  path: '/quiet',
  access: 'anyone',
  data: { cards: read(quietCards) },
  view: ({ cards }) => (
    <main>
      <h1>{cards.length} quiet cards</h1>
      <Form call={addCard} with={{ title: 'Quietly', rank: 600 }}><button type="submit">
        Add quietly
      </button></Form>
    </main>
  ),
})

// Only the staff may open it, and only the staff may read what it shows.
export const staffScreen = screen('staffScreen', {
  path: '/staff',
  access: role('staff'),
  data: { cards: read(staffCards) },
  view: ({ cards }) => <h1>{cards.length} for the staff</h1>,
})

// The screen at the sign-in path, which a move to a screen that needs a sign-in goes to.
export const signInScreen = screen('signInScreen', {
  path: '/sign-in',
  access: 'anyone',
  view: () => <h1>Sign in</h1>,
})

// A view: it reads the list with a hook, and shows the result of a call at once. A press in a view is
// not built yet, so the view hands its two calls to the test through the window, in an effect.
export const optimisticScreen = screen('optimisticScreen', {
  path: '/optimistic',
  access: 'anyone',
  view: () => {
    const found = useQuery(allCards)
    const optimistic = { query: allCards, to: (rows, given) => rows.filter((row) => row.id !== given.card) }
    const drop = useCall(dropCard, { optimistic })
    const keep = useCall(keepCard, { optimistic })
    useEffect(() => {
      Object.assign(window, { dropCard: drop.call, keepCard: keep.call })
    })
    const shown = found.value ?? []
    return (
      <main>
        <h1>{shown.length} cards</h1>
        {shown.map((card, place) => <span key={place}>{card.title}</span>)}
        <span>{keep.error ? keep.error.code : 'no error'}</span>
      </main>
    )
  },
})
