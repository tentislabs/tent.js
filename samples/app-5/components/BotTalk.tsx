import { type ReactNode, useEffect, useRef } from 'react'
import { boolean, component, Link, read, text, useAgent, useCall } from 'tentjs/ui'
import { bot as botAgent } from '../agents/bot'
import { chief } from '../agents/chief'
import { appList, setBotApp } from '../functions/apps'
import { getBot } from '../functions/bots'
import { openFolder, talkOf } from '../functions/talk'
import { answerAsk, asksOfBot, runList, runsUnder } from '../functions/runs'
import { Composer } from './Composer'
import { Face } from './Face'
import { BackIcon, ScreenIcon } from './icons'
import {
  AppCard,
  askTitle,
  ComputerCard,
  DraftCard,
  Message,
  NoteLine,
  QuestionCard,
  Thinking,
  When,
  type Work,
} from './Talk'

export type Bot = {
  id: string
  name: string
  kind: string
  shape: string
  colour: string
  brief: string
  apps: string[]
}
type App = { id: string; name: string; icon: string }
export type Said = { id: string; who: string; text?: string; data?: unknown; run?: string; createdAt: string }
export type Ask = {
  id: string
  run: string
  kind: string
  tool: string
  input?: unknown
  question?: string
  choices: string[]
  state: string
  answer?: string
  createdAt: string
}

/** One line of the computer card from a row of the talk that says what Claude Code did. */
function workOf(said: Said): Work {
  const data = Object(said.data ?? {})
  const input = Object(data.input ?? {})
  const what =
    input.command ?? input.file_path ?? input.path ?? input.url ?? input.pattern ?? said.text ?? JSON.stringify(input)
  // An app's tool comes as mcp__<app>__<tool>: the person reads the tool's own name.
  const tool = String(data.tool ?? 'step').replace(/^mcp__[^_]+__/, '')
  return { key: said.id, kind: tool, what: String(what) }
}

/** The app a bot's brief points to, by the kind of its mark: a bot with no app is offered that one. */
function appFor(brief: string, apps: App[]): App | undefined {
  const words = brief.toLowerCase()
  const kind = /mail|inbox|repl/.test(words)
    ? 'mail'
    : /calendar|call|meeting|book/.test(words)
      ? 'calendar'
      : /web|page|site|research/.test(words)
        ? 'browser'
        : /file|doc|folder|report/.test(words)
          ? 'files'
          : undefined
  return kind ? apps.find((app) => app.icon === kind) : undefined
}

/** The bots the chief handed work to under one of its runs, each with the state of its run. */
export const HandedOver = component('HandedOver', {
  props: { run: text() },
  data: ({ props }) => ({ under: read(runsUnder, { run: props.run }) }),
  view: ({ under }) => (
    <>
      {(under ?? []).map((one) => (
        <NoteLine key={one.id} id={`under-${one.run}`}>
          Handed to <strong>{one.bot.name}</strong>: {one.task} ·{' '}
          <span className={`state ${one.state}`}>{one.state}</span>
        </NoteLine>
      ))}
    </>
  ),
})

type Piece = { at: string; key: string; node: ReactNode }

/** The talk with one bot, or with the chief, read by its own data so a screen names only the bot. */
export const TalkOf = component('TalkOf', {
  props: { bot: text(), details: boolean({ default: false }) },
  data: ({ props }) => ({
    row: read(getBot, { id: props.bot }),
    talk: read(talkOf, { bot: props.bot }),
    asks: read(asksOfBot, { bot: props.bot }),
    apps: read(appList),
    runs: read(runList, { bot: props.bot }),
  }),
  view: ({ row, talk, asks, apps, runs, details }) =>
    row ? (
      <BotTalk
        key={row.id}
        bot={row}
        agent={row.kind === 'chief' ? chief : botAgent}
        talk={talk ?? []}
        asks={asks ?? []}
        apps={apps ?? []}
        startedBy={new Map((runs ?? []).map((one) => [one.run, one.by]))}
        details={details}
      />
    ) : null,
})

/** The talk itself: its pill at the top, its messages and cards, its run as it works, its field. */
function BotTalk({
  bot,
  agent,
  talk,
  asks,
  apps,
  startedBy,
  details,
}: {
  bot: Bot
  agent: typeof botAgent | typeof chief
  talk: Said[]
  asks: Ask[]
  apps: App[]
  startedBy: Map<string, string>
  details: boolean
}) {
  const a = useAgent(agent, { thread: bot.id })
  const answer = useCall(answerAsk)
  const take = useCall(openFolder)
  const allow = useCall(setBotApp)
  const offered = bot.kind === 'bot' && bot.apps.length === 0 && talk.length > 0 ? appFor(bot.brief, apps) : undefined
  const end = useRef<HTMLDivElement>(null)
  const running = a.state === 'queued' || a.state === 'running' || a.state === 'waiting'
  const waitingQuestion = asks.find((ask) => ask.kind === 'question' && ask.state === 'waiting')
  const kept = talk.some((said) => said.who === 'assistant' && said.run !== undefined && said.run === a.run)
  // A driver's run has no model step: its step `turn` says the text so far, which is shown until the talk keeps it.
  const said = a.said.findLast((one) => one.step.startsWith('turn') && typeof Object(one.value).text === 'string')
  const sofar = said ? String(Object(said.value).text) : a.answer
  // A question block at the end is drawn as its card once the run asks it, never as words while they arrive.
  const writing = sofar && !kept && running ? sofar.split('```question')[0].trim() : ''
  const toggle: `/${string}` = `/bots/${bot.id}${details ? '' : '?details=true'}`

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [talk.length, writing, asks.length])

  const pieces: Piece[] = []
  let work: Said[] = []
  const flush = () => {
    if (work.length === 0) return
    const first = work[0]
    const own = work
    const run = own.at(-1)?.run
    const state = asks.some((ask) => ask.state === 'waiting' && ask.run === run)
      ? 'waiting'
      : running && run === a.run
        ? 'working'
        : 'done'
    pieces.push({
      at: first.createdAt,
      key: `work-${first.id}`,
      node: (
        <ComputerCard
          line={
            state === 'done' ? `What ${bot.name} did in its own folder.` : `${bot.name} is working in its own folder.`
          }
          work={own.map(workOf)}
          working={state}
          takeOver={
            <button type="button" className="light" onClick={() => void take.call({ bot: bot.id })}>
              Take over
            </button>
          }
        />
      ),
    })
    work = []
  }
  for (const said of talk) {
    if (said.who === 'tool') {
      work.push(said)
      continue
    }
    flush()
    if (said.who === 'summary') continue
    // What a routine or the chief asked is no message of the person's: it is a line in the middle.
    const by = said.who === 'user' && said.run ? startedBy.get(said.run) : undefined
    if (by === 'routine' || by === 'chief') {
      pieces.push({
        at: said.createdAt,
        key: said.id,
        node: (
          <NoteLine id={`said-${said.id}`}>
            {by === 'routine' ? 'Routine' : 'From the chief'}: <strong>{said.text}</strong>
          </NoteLine>
        ),
      })
      continue
    }
    pieces.push({
      at: said.createdAt,
      key: said.id,
      node: (
        <>
          <Message id={`said-${said.id}`} text={said.text ?? ''} mine={said.who === 'user'} />
          {bot.kind === 'chief' && said.who === 'assistant' && said.run && <HandedOver run={said.run} />}
        </>
      ),
    })
  }
  flush()
  for (const ask of asks) {
    const busy = answer.busy
    pieces.push({
      at: ask.createdAt,
      key: ask.id,
      node:
        ask.kind === 'question' ? (
          <QuestionCard
            question={ask.question ?? ''}
            choices={ask.choices}
            picked={ask.state === 'waiting' ? undefined : (ask.answer ?? '')}
            busy={busy}
            onPick={(choice) => void answer.call({ ask: ask.id, yes: true, answer: choice })}
          />
        ) : (
          <DraftCard
            id={`ask-${ask.id}`}
            title={askTitle(ask.tool, bot.name)}
            input={ask.input}
            answers={
              ask.state === 'waiting' ? (
                <>
                  <button
                    type="button"
                    className="light"
                    disabled={busy}
                    onClick={() => void answer.call({ ask: ask.id, yes: true })}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    className="outlined"
                    disabled={busy}
                    onClick={() => void answer.call({ ask: ask.id, yes: false })}
                  >
                    No
                  </button>
                </>
              ) : (
                <span className="answered">{ask.state === 'yes' ? 'You said Yes' : 'You said No'}</span>
              )
            }
          />
        ),
    })
  }
  pieces.sort((x, y) => x.at.localeCompare(y.at))

  return (
    <div className="chat" data-colour={bot.colour}>
      <Link to="/bots" className="round back" aria-label="Back to the bots">
        <BackIcon />
      </Link>
      <div className="chat-top">
        <Link to={toggle} className="pill" aria-label={`${bot.name}, details`} keep>
          <Face shape={bot.shape} colour={bot.colour} size={26} />
          <span>{bot.name}</span>
        </Link>
      </div>
      <div className="chat-actions">
        <Link to={toggle} className="round" aria-label={`The computer of ${bot.name}`} keep>
          <ScreenIcon />
        </Link>
      </div>
      <div className="talk">
        <div className="column" aria-live="polite">
          {pieces[0] && <When at={pieces[0].at} now={new Date().toISOString()} />}
          {pieces.map((piece) => (
            <div key={piece.key} className="piece">
              {piece.node}
            </div>
          ))}
          {offered && (
            <AppCard
              name={offered.name}
              line={`Let ${bot.name} use ${offered.name}`}
              action={
                <button
                  type="button"
                  className="light"
                  disabled={allow.busy}
                  onClick={() => void allow.call({ bot: bot.id, app: offered.id, on: true })}
                >
                  Authorize
                </button>
              }
            />
          )}
          {writing && <Message id="answer" text={writing} />}
          {running && !writing && !asks.some((ask) => ask.state === 'waiting') && <Thinking />}
          {a.error && (
            <p className="failed" role="alert" id="failed">
              {a.error.message} ({a.error.code})
            </p>
          )}
          <div ref={end} />
        </div>
      </div>
      <Composer
        placeholder={waitingQuestion ? 'Type your answer, or talk about something else' : `Message ${bot.name}`}
        busy={a.state === 'queued' || a.state === 'running'}
        onSend={(message) => void a.send(message)}
      />
    </div>
  )
}
