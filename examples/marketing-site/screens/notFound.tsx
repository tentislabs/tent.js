import { anyone, Link, screen, message } from 'tentjs/ui'
import { SiteFrame } from '../components/SiteFrame'

export const notFoundScreen = screen('notFoundScreen', {
  for: 'notFound',
  title: message('notFound.title'),
  access: anyone('a lost visitor is shown the way back'),
  layout: SiteFrame,
  view: () => {
    return (
      <main className="lost">
        <h1>{message('notFound.title')}</h1>
        <p>{message('notFound.lead')}</p>
        <Link to="/" className="button">
          {message('notFound.home')}
        </Link>
      </main>
    )
  },
})
