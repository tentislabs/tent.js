import { screen, read, Image } from 'tentjs/ui'
import { allDrafts } from './functions'

// The drafts, whose photos a visitor may not download.
export const draftsScreen = screen('draftsScreen', {
  path: '/drafts',
  access: 'anyone',
  title: 'Drafts',
  data: { drafts: read(allDrafts) },
  view: ({ drafts }) => (
    <main>
      {drafts.map((d) => (
        <Image key={d.id} className="draft" src={d.photo} alt={d.title} width={80} height={40} />
      ))}
    </main>
  ),
})
