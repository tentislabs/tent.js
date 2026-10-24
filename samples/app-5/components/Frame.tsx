import '../screens/app.css'
import { useEffect, useRef, useState } from 'react'
import { component, Link, read, useParams } from 'tentjs/ui'
import { botList } from '../functions/bots'
import { me } from '../functions/people'
import { askList } from '../functions/runs'
import { AppMark } from './AppMark'
import { CreateBot } from './CreateBot'
import { Face } from './Face'
import { PlusIcon, SearchIcon, StarMark } from './icons'

/** The window every screen is shown in: the sidebar with the chief as a tile and the other bots as rows. */
export const Frame = component('Frame', {
  data: { bots: read(botList), person: read(me), asks: read(askList) },
  view: ({ bots, person, asks, children }) => {
    const { id } = useParams()
    const [creating, setCreating] = useState(false)
    const [search, setSearch] = useState<string | undefined>(undefined)
    const words = (search ?? '').trim().toLowerCase()
    const all = bots ?? []
    const chief = all.find((bot) => bot.kind === 'chief')
    const rows = all.filter((bot) => bot.kind === 'bot' && (!words || bot.name.toLowerCase().includes(words)))
    return (
      <div className={id ? 'frame open' : 'frame'}>
        <nav className="side" aria-label="Bots">
          <div className="side-top">
            {search === undefined ? (
              <button type="button" className="round" aria-label="Search" onClick={() => setSearch('')}>
                <SearchIcon />
              </button>
            ) : (
              <SearchBox words={search} onChange={setSearch} />
            )}
            <button type="button" className="round" aria-label="New bot" onClick={() => setCreating(true)}>
              <PlusIcon />
            </button>
          </div>
          <div className="side-list">
            {chief && (
              <div className="tiles">
                <Link to="/bots" exact className="tile" id={`bot-${chief.id}`}>
                  <span className="tile-face">
                    {chief.working ? (
                      <Dots colour={chief.colour} big />
                    ) : (
                      <Face shape={chief.shape} colour={chief.colour} size={66} />
                    )}
                    <span className="badge">
                      <StarMark />
                    </span>
                  </span>
                  <span>{chief.name}</span>
                </Link>
              </div>
            )}
            {(asks ?? []).length > 0 && (
              <Link to="/asks" className="asks-link" id="asks-link">
                <span className="needs" aria-hidden="true" />
                {(asks ?? []).length === 1 ? '1 ask waits for you' : `${(asks ?? []).length} asks wait for you`}
              </Link>
            )}
            <ul className="rows">
              {rows.map((bot) => (
                <li key={bot.id}>
                  <Link
                    to={`/bots/${bot.id}`}
                    className="row"
                    id={`bot-${bot.id}`}
                    aria-label={bot.name}
                    aria-describedby={`last-${bot.id}`}
                  >
                    {bot.working ? (
                      <Dots colour={bot.colour} />
                    ) : (
                      <Face shape={bot.shape} colour={bot.colour} size={42} />
                    )}
                    <span className="row-words">
                      <span className="row-name">
                        {bot.name}
                        {bot.waiting && <span className="needs" role="img" aria-label="Needs you" />}
                      </span>
                      <span className="row-last" id={`last-${bot.id}`}>
                        {bot.last?.text || bot.brief}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="side-foot">
            <Link to="/settings" className="me" aria-label="Settings">
              {(person?.name || person?.email || '?').slice(0, 1).toUpperCase()}
            </Link>
            <Link to="/apps" className="apps-pill">
              Connect apps
              <span className="app-marks">
                <AppMark kind="files" />
                <AppMark kind="browser" />
                <AppMark kind="calendar" />
              </span>
            </Link>
          </div>
        </nav>
        {children}
        {creating && <CreateBot onClose={() => setCreating(false)} />}
      </div>
    )
  },
})

/** The search of the sidebar: it opens on a press of the round button, with the focus in it. */
function SearchBox({ words, onChange }: { words: string; onChange: (words: string | undefined) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.focus(), [])
  return (
    <input
      ref={ref}
      className="side-search"
      aria-label="Search bots"
      placeholder="Search"
      value={words}
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => !words && onChange(undefined)}
    />
  )
}

/** Three dots of the bot's colour in the place of its face, while it works. */
function Dots({ colour, big = false }: { colour: string; big?: boolean }) {
  return (
    <span
      className={big ? 'dots face-dots big' : 'dots face-dots'}
      data-colour={colour}
      role="img"
      aria-label="Working"
    >
      <i />
      <i />
      <i />
    </span>
  )
}
