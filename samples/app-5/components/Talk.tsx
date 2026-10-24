import { Fragment, type ReactNode } from 'react'
import { AppMark, markOf } from './AppMark'
import { CheckCircleIcon, SparkIcon, VerifiedMark } from './icons'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

/** Bold words between two pairs of stars, as a bot writes them. */
function strong(text: string): ReactNode[] {
  const pieces: ReactNode[] = []
  let n = 0
  for (const piece of text.split(/(\*\*[^*]+\*\*)/)) {
    n += 1
    pieces.push(piece.startsWith('**') && piece.endsWith('**') ? <b key={`b${n}`}>{piece.slice(2, -2)}</b> : piece)
  }
  return pieces
}

type Block = { key: string; list: boolean; lines: { key: string; text: string }[] }

const CHECK = /^(✓|\[x\]|- \[x\])\s/
const BULLET = /^\s*[-*•]\s/

/** The blocks of a message: runs of plain lines, and runs of "- " lines drawn as bullets. */
function blocksOf(lines: string[]): Block[] {
  const blocks: Block[] = []
  let n = 0
  for (const line of lines) {
    n += 1
    const list = BULLET.test(line)
    const one = { key: `l${n}`, text: list ? line.replace(BULLET, '') : line }
    const last = blocks.at(-1)
    if (last && last.list === list) last.lines.push(one)
    else blocks.push({ key: `k${n}`, list, lines: [one] })
  }
  return blocks
}

/** A message: its lines, with "- " lines drawn as bullets and a message of "✓ " lines as a check list. */
export function Message({ text, mine = false, id }: { text: string; mine?: boolean; id?: string }) {
  const lines = text.replace(/\r/g, '').trim().split('\n')
  const filled = lines.filter((line) => line.trim())
  if (!mine && filled.length > 0 && filled.every((line) => CHECK.test(line.trim())))
    return (
      <ul className="bubble checks" id={id}>
        {blocksOf(filled)
          .flatMap((block) => block.lines)
          .map((line) => (
            <li key={line.key}>{strong(line.text.trim().replace(CHECK, ''))}</li>
          ))}
      </ul>
    )
  return (
    <div className={mine ? 'bubble mine' : 'bubble'} id={id}>
      {blocksOf(lines).map((block) =>
        block.list ? (
          <ul key={block.key}>
            {block.lines.map((line) => (
              <li key={line.key}>{strong(line.text)}</li>
            ))}
          </ul>
        ) : (
          <Fragment key={block.key}>
            {strong(
              block.lines
                .map((line) => line.text)
                .join('\n')
                .trim(),
            )}
          </Fragment>
        ),
      )}
    </div>
  )
}

/** The time line in the middle of a talk: "Today 8:34 AM". */
export function When({ at, now }: { at: string; now: string }) {
  const moment = new Date(at)
  const today = new Date(now)
  const sameDay = moment.toDateString() === today.toDateString()
  const yesterday = new Date(today.getTime() - 86_400_000).toDateString() === moment.toDateString()
  const time = moment.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const day = sameDay
    ? 'Today'
    : yesterday
      ? 'Yesterday'
      : moment.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return (
    <p className="when">
      {day} {time}
    </p>
  )
}

/** A line in the middle for what happened: work the chief handed to a bot. */
export function NoteLine({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p className="note-line" id={id}>
      <SparkIcon />
      <span>{children}</span>
    </p>
  )
}

/** A question of one card with lettered choices: a press on a choice is the answer. */
export function QuestionCard({
  question,
  choices,
  picked,
  onPick,
  busy,
}: {
  question: string
  choices: string[]
  picked?: string
  onPick?: (choice: string) => void
  busy?: boolean
}) {
  const answered = picked !== undefined
  return (
    <section className="card" aria-label={question}>
      <h3 className={answered ? 'card-head done' : 'card-head'}>{question}</h3>
      <ul className="choices">
        {choices.map((choice, i) => (
          <li key={choice}>
            <button
              type="button"
              className="choice"
              aria-pressed={picked === choice}
              disabled={answered || busy || !onPick}
              onClick={() => onPick?.(choice)}
            >
              <span className="letter" aria-hidden="true">
                {LETTERS[i] ?? '?'}
              </span>
              <span>{choice}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** A card for an app a bot would use, with "Authorize". */
export function AppCard({ name, line, action }: { name: string; line: string; action: ReactNode }) {
  return (
    <>
      <section className="card app-card" aria-label={name}>
        <span className="app-icon">
          <AppMark kind={markOf(name)} size={30} />
        </span>
        <span className="app-words">
          <span className="app-name">
            {name} <VerifiedMark />
          </span>
          <span className="app-line">{line}</span>
        </span>
        {action}
      </section>
      <p className="card-foot">Your bots always ask before making changes. Disconnect at any time.</p>
    </>
  )
}

/** The words of an ask: what the bot would have done, as a person reads it. */
export function askTitle(tool: string, bot: string): string {
  const name = tool.replace(/^mcp__[^_]+__/, '')
  if (/send.?invite/i.test(name)) return `${bot} wants to send the invitation`
  if (/^bash$/i.test(name)) return `${bot} wants to run a command`
  if (/^(write|edit)$/i.test(name)) return `${bot} wants to change a file`
  if (/^web.?fetch$/i.test(name)) return `${bot} wants to open a page`
  return `${bot} wants to use ${name}`
}

const MOMENT = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

function shown(value: unknown): string {
  if (typeof value === 'string')
    return /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(value) && !Number.isNaN(Date.parse(value))
      ? MOMENT.format(new Date(value))
      : value
  if (Array.isArray(value)) return value.map(shown).join(', ')
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

/** A draft that needs a yes: what would be done, in a box, with "Yes" and "No" under it. */
export function DraftCard({
  title,
  input,
  answers,
  id,
}: {
  title: string
  input: unknown
  answers: ReactNode
  id?: string
}) {
  const entries: [string, unknown][] =
    input !== null && typeof input === 'object' && !Array.isArray(input) ? Object.entries(input) : [['', input]]
  return (
    <section className="card draft" aria-label={title} id={id}>
      <h3 className="draft-title">{title}</h3>
      <dl className="draft-box">
        {entries.map(([key, value]) => (
          <div key={key}>
            {key && <dt>{key}</dt>}
            <dd>{shown(value)}</dd>
          </div>
        ))}
      </dl>
      <div className="answers">{answers}</div>
    </section>
  )
}

export type Work = { key: string; kind: string; what: string }

/** The computer card: what Claude Code does in the bot's own folder, with "Take over" that opens it. */
export function ComputerCard({
  line,
  work,
  working,
  takeOver,
}: {
  line: string
  work: Work[]
  working: 'working' | 'waiting' | 'done'
  takeOver?: ReactNode
}) {
  return (
    <section className="card computer" aria-label="Computer">
      <div className="computer-head">
        <h3>Computer</h3>
        <span className={working === 'done' ? 'chip done' : 'chip'}>
          {working === 'done' ? <CheckCircleIcon /> : <SparkIcon />}
          {working === 'working' ? 'Working' : working === 'waiting' ? 'Waiting for you' : 'Done'}
        </span>
      </div>
      <p className="computer-line">{line}</p>
      <div className="screen">
        <ul className="term">
          {work.slice(-8).map((one) => (
            <li key={one.key}>
              <span className="kind">{one.kind} </span>
              {one.what}
            </li>
          ))}
          {work.length === 0 && <li className="kind">Waiting for the first step</li>}
        </ul>
      </div>
      {takeOver && <div className="computer-foot">{takeOver}</div>}
    </section>
  )
}

/** "Thinking it through", with three dots of the bot's colour. */
export function Thinking({ words = 'Thinking it through' }: { words?: string }) {
  return (
    <p className="thinking" role="status">
      <span className="dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="shimmer">{words}</span>
    </p>
  )
}
