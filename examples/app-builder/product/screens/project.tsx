import {
  AppWindow,
  Check,
  ChevronRight,
  ExternalLink,
  MousePointer2,
  Rocket,
  SendHorizontal,
  ShieldAlert,
  TriangleAlert,
  Undo2,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, read, screen, useCall, useQuery, useRun } from 'tentjs/ui'
import { AppFrame, Waiting } from '../components/frame'
import { Mark } from '../components/icons'
import { myProjects, projectMessages, publishProject, sendTurn, undoTurn } from '../functions/projects'
import { builder } from '../models/builder'
import { homeScreen } from './home'

type Place = { file: string; from: number; to: number }
type Pointed = { screen: string; place: Place; tag: string }

// What the page of a workspace tells about the element that was picked, in the inspect mode.
function pickedOf(data: unknown): Pointed | undefined {
  if (typeof data !== 'object' || data === null) return undefined
  const element = 'element' in data ? data.element : undefined
  if (typeof element !== 'object' || element === null) return undefined
  const view = 'view' in element ? element.view : undefined
  const tag = 'tag' in element ? element.tag : undefined
  const place = 'place' in element ? element.place : undefined
  if (typeof view !== 'string' || typeof place !== 'object' || place === null) return undefined
  const file = 'file' in place ? place.file : undefined
  const from = 'from' in place ? place.from : undefined
  const to = 'to' in place ? place.to : undefined
  if (typeof file !== 'string' || typeof from !== 'number' || typeof to !== 'number') return undefined
  return { screen: view, place: { file, from, to }, tag: typeof tag === 'string' ? tag : 'element' }
}

function kindOf(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null || !('t' in data)) return undefined
  return typeof data.t === 'string' ? data.t : undefined
}

// A tool step that the engine refused names its code in its answer.
function refusalOf(text: string | undefined, data: unknown): string | undefined {
  const said = `${text ?? ''} ${data === undefined ? '' : JSON.stringify(data)}`
  return /T9105|T3101/.test(said) ? said : undefined
}

// What an ask of the builder would carry out: the function it tries, or else the tool.
function askedOf(ask: object): string {
  const input = 'input' in ask && typeof ask.input === 'object' && ask.input !== null ? ask.input : {}
  const name = 'name' in input ? input.name : undefined
  if (typeof name === 'string') return name
  return 'tool' in ask ? String(ask.tool) : 'a step'
}

const VERBS: Record<string, string> = {
  map: 'Read the outline',
  read: 'Read',
  search: 'Searched',
  docs: 'Read the docs',
  edit: 'Changed',
  write: 'Wrote',
  rename: 'Renamed',
  remove: 'Removed',
  check: 'Checked the app',
  run: 'Tried',
  rows: 'Read the test rows of',
  logs: 'Read the log',
  shot: 'Looked at',
  history: 'Read the history',
  compare: 'Compared',
  changedBy: 'Found who changed',
}

// The steps a message of the assistant took, each as one short line: what it did, and to what.
function stepsOf(data: unknown): string[] {
  if (typeof data !== 'object' || data === null || !('calls' in data) || !Array.isArray(data.calls)) return []
  return data.calls.map((one: unknown) => {
    if (typeof one !== 'object' || one === null || !('tool' in one) || typeof one.tool !== 'string') return 'A step'
    const input = 'input' in one && typeof one.input === 'object' && one.input !== null ? one.input : {}
    const what = ['path', 'name', 'table', 'text'].map((key) => (key in input ? String(Reflect.get(input, key)) : ''))
    const object = what.find((word) => word.length > 0) ?? ''
    return `${VERBS[one.tool] ?? one.tool} ${object.length > 60 ? `${object.slice(0, 60)}...` : object}`.trim()
  })
}

type Said = { id: string; who: string; text?: string | null; data?: unknown }

type Entry =
  | { kind: 'user'; id: string; text: string; pointedAt?: string }
  | { kind: 'said'; id: string; text: string }
  | { kind: 'steps'; id: string; steps: string[] }
  | { kind: 'refused'; id: string; count: number }
  | { kind: 'undone'; id: string }

// The engine adds a line of its own words to a message where the person pointed at a part of the app.
const POINTED = /\n+The person points at the tag ([^\s:]+):\d+-\d+ of the source of the screen \w+\.?\s*$/

// The conversation as the chat draws it: the steps of the builder in one list for each run of them, the refusals
// of the engine in one note, and a line where the person went back.
function entriesOf(conversation: readonly Said[], undoneAt: readonly number[]): Entry[] {
  const entries: Entry[] = []
  const last = () => entries.at(-1)
  conversation.forEach((said, at) => {
    if (said.who === 'user' && said.text) {
      const pointed = POINTED.exec(said.text)
      entries.push(
        pointed
          ? { kind: 'user', id: said.id, text: said.text.slice(0, pointed.index), pointedAt: pointed[1] }
          : { kind: 'user', id: said.id, text: said.text },
      )
    }
    if (said.who === 'assistant') {
      if (said.text) entries.push({ kind: 'said', id: said.id, text: said.text })
      const steps = stepsOf(said.data)
      const before = last()
      if (steps.length > 0 && before?.kind === 'steps') before.steps.push(...steps)
      else if (steps.length > 0) entries.push({ kind: 'steps', id: said.id, steps })
    }
    if (said.who === 'tool' && refusalOf(said.text ?? undefined, said.data)) {
      const before = last()
      if (before?.kind === 'refused') before.count += 1
      else entries.push({ kind: 'refused', id: said.id, count: 1 })
    }
    for (const undone of undoneAt) if (undone === at + 1) entries.push({ kind: 'undone', id: `${said.id}-undone` })
  })
  return entries
}

export const projectScreen = screen('projectScreen', {
  path: '/p/:id',
  title: 'Project',
  access: 'signedIn',
  layout: AppFrame,
  loading: Waiting,
  data: ({ params }) => ({
    projects: read(myProjects),
    conversation: read(projectMessages, { project: params.id }),
  }),
  view: ({ projects, conversation, params }) => {
    const project = projects.find((one) => one.id === params.id)
    const frame = useRef<HTMLIFrameElement>(null)
    const log = useRef<HTMLDivElement>(null)
    const [message, setMessage] = useState('')
    const [run, setRun] = useState<string | undefined>(undefined)
    const [picking, setPicking] = useState(false)
    const [pointed, setPointed] = useState<Pointed | undefined>(undefined)
    const [loads, setLoads] = useState(0)
    const [undoneAt, setUndoneAt] = useState<number[]>([])
    const working = useQuery(builder.working, { thread: params.id })
    const current = run ?? working.value?.[0]?.run
    const turn = useRun(current)
    const send = useCall(sendTurn)
    const undo = useCall(undoTurn)
    const publish = useCall(publishProject)
    const busy = turn.state === 'queued' || turn.state === 'running' || turn.state === 'waiting'
    const origin = project ? new URL(project.address).origin : ''

    // The frame shows the app anew once a turn has ended or was undone: the frame's address builds what changed.
    const wasBusy = useRef(false)
    useEffect(() => {
      if (wasBusy.current && !busy) setLoads((n) => n + 1)
      wasBusy.current = busy
    }, [busy])

    useEffect(() => {
      log.current?.scrollTo({ top: log.current.scrollHeight })
    }, [conversation.length, turn.answer, turn.asks.length])

    useEffect(() => {
      const heard = (event: MessageEvent) => {
        if (event.origin !== origin || event.source !== frame.current?.contentWindow) return
        if (kindOf(event.data) !== 'tent.picked') return
        const picked = pickedOf(event.data)
        if (!picked) return
        setPointed(picked)
        setPicking(false)
        frame.current?.contentWindow?.postMessage({ t: 'tent.pick', on: false }, origin)
        frame.current?.contentWindow?.postMessage(
          { t: 'tent.highlight', place: picked.place, color: '#5b4fe0' },
          origin,
        )
      }
      window.addEventListener('message', heard)
      return () => window.removeEventListener('message', heard)
    }, [origin])

    if (!project) {
      return (
        <main className="mx-auto grid min-h-dvh max-w-md place-items-center px-4">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="grid size-11 place-items-center rounded-full bg-base-100 text-base-content/60">
              <AppWindow className="size-5" aria-hidden="true" />
            </span>
            <h1 className="text-lg font-semibold">That project is not there</h1>
            <p className="text-sm text-base-content/70">It was removed, or it belongs to someone else.</p>
            <Link to={homeScreen} className="btn btn-sm btn-primary">
              Back to your projects
            </Link>
          </div>
        </main>
      )
    }

    const point = () => {
      const on = !picking
      setPicking(on)
      frame.current?.contentWindow?.postMessage({ t: 'tent.pick', on }, origin)
    }

    const unpoint = () => {
      setPointed(undefined)
      frame.current?.contentWindow?.postMessage({ t: 'tent.highlight' }, origin)
    }

    const submit = async (event: { preventDefault: () => void }) => {
      event.preventDefault()
      const words = message.trim()
      if (!words || busy || send.busy) return
      const at = pointed ? { screen: pointed.screen, place: pointed.place } : undefined
      const started = await send.call({ project: project.id, message: words, at }).catch(() => undefined)
      // A message that was refused stays in the field, and `send.error` says why.
      if (!started) return
      setMessage('')
      unpoint()
      setRun(started?.run)
    }

    const back = async () => {
      // A failed undo refuses the promise, and is shown by `undo.error`.
      await undo.call({ project: project.id }).then(
        () => setUndoneAt((at) => [...at, conversation.length]),
        () => undefined,
      )
      setRun(undefined)
      setLoads((n) => n + 1)
    }

    const live = publish.value?.live ?? project.live
    const failed = send.error ?? undo.error ?? publish.error

    return (
      <div className="flex min-h-dvh flex-col lg:h-dvh">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-base-300 bg-base-100 px-3 sm:gap-3 sm:px-4">
          <Link
            to={homeScreen}
            className="grid size-8 shrink-0 place-items-center rounded-field bg-primary text-primary-content"
            aria-label="Small builder"
          >
            <Mark />
          </Link>
          <nav className="flex min-w-0 items-center gap-1.5 text-sm" aria-label="Where you are">
            <Link to={homeScreen} className="text-base-content/70 hover:text-base-content max-sm:hidden">
              Projects
            </Link>
            <ChevronRight className="size-3.5 shrink-0 text-base-content/40 max-sm:hidden" aria-hidden="true" />
            <span className="truncate font-semibold">{project.name}</span>
          </nav>
          <span className="flex-1" />
          {live && (
            <a
              className="btn btn-ghost btn-sm min-w-0 font-normal text-success max-md:btn-square"
              href={live}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate font-mono text-xs max-md:sr-only">{new URL(live).host}</span>
            </a>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={back} disabled={undo.busy || busy}>
            {undo.busy ? (
              <span className="loading loading-spinner loading-xs" aria-hidden="true" />
            ) : (
              <Undo2 className="size-4" aria-hidden="true" />
            )}
            Undo
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void publish.call({ project: project.id }).catch(() => undefined)}
            disabled={publish.busy || busy}
          >
            {publish.busy ? (
              <span className="loading loading-spinner loading-xs" aria-hidden="true" />
            ) : (
              <Rocket className="size-4" aria-hidden="true" />
            )}
            Publish
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <section
            className="flex flex-col border-base-300 bg-base-100 max-lg:border-b lg:w-[26rem] lg:shrink-0 lg:border-r"
            aria-label="Chat"
          >
            <div className="flex-1 space-y-4 px-4 py-5 lg:overflow-y-auto" ref={log} aria-live="polite">
              {conversation.length === 0 && !busy && (
                <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
                  <h2 className="text-lg font-semibold">What should it be?</h2>
                  <p className="max-w-xs text-sm text-base-content/70">
                    Say what the app is for. Point at a part of it to ask for a change there.
                  </p>
                </div>
              )}
              {entriesOf(conversation, undoneAt).map((entry) => {
                if (entry.kind === 'user')
                  return (
                    <div key={entry.id} className="flex flex-col items-end gap-1">
                      <p className="max-w-[85%] whitespace-pre-wrap rounded-box rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-content">
                        {entry.text}
                      </p>
                      {entry.pointedAt && (
                        <span className="flex items-center gap-1 text-xs text-base-content/60">
                          <MousePointer2 className="size-3" aria-hidden="true" /> Pointed at{' '}
                          <code className="font-mono">{entry.pointedAt}</code>
                        </span>
                      )}
                    </div>
                  )
                if (entry.kind === 'said')
                  return (
                    <p key={entry.id} className="max-w-[90%] whitespace-pre-wrap text-sm leading-relaxed">
                      {entry.text}
                    </p>
                  )
                if (entry.kind === 'steps')
                  return (
                    <ul key={entry.id} className="space-y-1 border-l-2 border-base-300 pl-3">
                      {entry.steps.map((step, n) => (
                        <li
                          key={`${entry.id}-${n}`}
                          className="flex items-center gap-1.5 font-mono text-xs text-base-content/60"
                        >
                          <Check className="size-3 shrink-0 text-success" aria-hidden="true" />
                          <span className="truncate">{step}</span>
                        </li>
                      ))}
                    </ul>
                  )
                if (entry.kind === 'refused')
                  return (
                    <div key={entry.id} className="alert alert-error alert-soft items-start text-sm" role="note">
                      <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      <span>
                        <strong className="block font-semibold">Refused by the engine</strong>
                        {entry.count === 1
                          ? 'A step reached outside this project, and was stopped.'
                          : `${entry.count} steps reached outside this project, and were stopped.`}
                      </span>
                    </div>
                  )
                return (
                  <div key={entry.id} className="divider my-2 text-xs text-base-content/60">
                    <Undo2 className="size-3.5" aria-hidden="true" /> Went back to before this
                  </div>
                )
              })}
              {busy && typeof turn.answer === 'string' && turn.answer && (
                <p className="max-w-[90%] whitespace-pre-wrap text-sm leading-relaxed">{turn.answer}</p>
              )}
              {turn.asks.map((ask) => (
                <div
                  key={`${ask.run} ${ask.step}`}
                  className="space-y-3 rounded-box border border-warning/40 bg-warning/10 p-4 text-sm"
                  role="alertdialog"
                  aria-label="A question"
                >
                  <p className="flex items-start gap-2">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                    <span>
                      <strong className="font-semibold">Before anything goes out.</strong> The builder wants to try{' '}
                      <code className="rounded bg-base-100 px-1 py-0.5 font-mono text-xs">{askedOf(ask)}</code>, which
                      sends mail from your app. Send it?
                    </span>
                  </p>
                  <div className="flex gap-2 pl-6">
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => void turn.approve?.(ask)}>
                      Send it
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => void turn.refuse?.(ask)}>
                      Not now
                    </button>
                  </div>
                </div>
              ))}
              {(busy || send.busy) && turn.asks.length === 0 && (
                <div className="flex items-center gap-2 text-sm text-base-content/70" role="status">
                  <span className="loading loading-dots loading-sm text-primary" aria-hidden="true" /> Building
                </div>
              )}
              {failed && (
                <p className="alert alert-error alert-soft text-sm" role="alert">
                  {failed.message}
                </p>
              )}
            </div>

            <form className="shrink-0 border-t border-base-300 p-3" onSubmit={submit} aria-label="Ask the builder">
              {pointed && (
                <span className="mb-2 inline-flex items-center gap-1.5 rounded-field bg-primary/10 py-1 pr-1 pl-2 text-xs text-primary">
                  <MousePointer2 className="size-3.5" aria-hidden="true" /> Pointing at{' '}
                  <code className="font-mono">&lt;{pointed.tag}&gt;</code>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs btn-square text-primary"
                    onClick={unpoint}
                    aria-label="Stop pointing"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </span>
              )}
              <div className="rounded-box border border-base-300 bg-base-100 motion-safe:transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                <textarea
                  aria-label="Message"
                  name="message"
                  rows={3}
                  className="block w-full resize-none bg-transparent px-3.5 pt-3 text-sm outline-none placeholder:text-base-content/45"
                  value={message}
                  placeholder={pointed ? 'What should change here?' : 'Describe the app, or a change to it'}
                  onChange={(event) => setMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) void submit(event)
                  }}
                />
                <div className="flex items-center gap-2 p-2">
                  <button
                    type="button"
                    className={picking ? 'btn btn-sm btn-soft btn-primary' : 'btn btn-sm btn-ghost'}
                    onClick={point}
                    aria-pressed={picking}
                  >
                    <MousePointer2 className="size-4" aria-hidden="true" /> Point
                  </button>
                  <span className="flex-1" />
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    disabled={!message.trim() || busy || send.busy}
                  >
                    {send.busy ? (
                      <span className="loading loading-spinner loading-xs" aria-hidden="true" />
                    ) : (
                      <SendHorizontal className="size-4" aria-hidden="true" />
                    )}
                    Send
                  </button>
                </div>
              </div>
            </form>
          </section>

          <section className="flex min-h-[32rem] flex-1 flex-col p-3 sm:p-4" aria-label="Your app">
            <div
              className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-box border bg-base-100 motion-safe:transition-shadow ${
                picking ? 'border-primary ring-4 ring-primary/20' : 'border-base-300'
              }`}
            >
              <div className="flex h-10 shrink-0 items-center gap-3 border-b border-base-300 px-3">
                <span className="flex gap-1.5" aria-hidden="true">
                  <i className="size-2.5 rounded-full bg-base-300" />
                  <i className="size-2.5 rounded-full bg-base-300" />
                  <i className="size-2.5 rounded-full bg-base-300" />
                </span>
                <span className="min-w-0 flex-1 truncate rounded-field bg-base-200 px-3 py-1 text-center font-mono text-xs text-base-content/60">
                  {new URL(project.address).host}
                </span>
                {picking && (
                  <span className="text-xs font-medium text-primary max-sm:hidden">Pick a part of your app</span>
                )}
              </div>
              <div className="relative min-h-0 flex-1">
                {conversation.length === 0 && !busy ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
                    <span className="grid size-11 place-items-center rounded-full bg-base-200 text-base-content/60">
                      <AppWindow className="size-5" aria-hidden="true" />
                    </span>
                    <h2 className="font-medium">Your app shows here</h2>
                    <p className="text-sm text-base-content/70">It runs on test data while it is built.</p>
                  </div>
                ) : (
                  <iframe
                    key={loads}
                    data-loads={loads}
                    ref={frame}
                    title="Your app"
                    src={`/frame/${project.id}`}
                    className="absolute inset-0 size-full bg-white"
                    sandbox="allow-scripts allow-forms allow-same-origin"
                  />
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    )
  },
})
