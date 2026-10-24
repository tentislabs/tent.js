import { useState } from 'react'
import { screen, useQuery, useParams, useUser } from 'tentjs/ui'

// What a screen file is handed in place of a backend definition.
const openOrders = { definition: 'openOrders', kind: 'query', input: {}, live: true } as const

export const codeScreen = screen('codeScreen', {
  path: '/code/:id',
  access: 'anyone',
  title: ({ params }) => `Orders of ${params.id}`,
  view: () => {
    // A hook of React itself: it works only where the view and the page code hold one React.
    const [limit] = useState(2)
    const found = useQuery(openOrders, { limit })
    const params = useParams()
    const user = useUser()
    return (
      <div>
        <h1>
          {params.id} for {user?.id ?? 'nobody'}
        </h1>
        {found.value?.length ? (
          found.value.map((o: { name: string }) => <span key={o.name}>{o.name}</span>)
        ) : (
          <span>Still asked</span>
        )}
      </div>
    )
  },
})

// What the server module of a view gives as its default.
export default { name: 'codeScreen', kind: 'screen', view: codeScreen.options.view, title: codeScreen.options.title }
