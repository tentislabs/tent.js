import type { Touched } from '../../data/index.ts'
import type { Told } from '../../flows/index.ts'
import { hearParts } from '../ai/told.ts'
import type { Frame } from '../copy/link.ts'
import { limitOf, storedLimit } from '../limits.ts'
import { list } from '../live/list.ts'
import type { LiveOpened } from '../liveDoor.ts'
import type { Opened } from '../opened.ts'
import type { LiveMessage, Socket } from './connection.ts'
import { groupsOf } from './groups.ts'
import { heardOf } from './heard.ts'
import type { Connected } from './held.ts'
import { failuresShown } from '../failed/held.ts'
import { runsOf } from './runs.ts'
import { gather } from '../counts/gather.ts'
import { callerText } from '../../data/index.ts'

// The times of the signs of life, in milliseconds. A page and the engine must agree on them, so no project changes one.
const beat = 30_000
const answerTime = 15_000

/** What a switch of development tells the open pages beside the version: the modules they take in place, or to reload. */
export type SwitchTold = { swap: { address: string; mark: string }[] } | { reload: true }

/** The live hub of one app: it holds the live connections, and is told each committed write. */
export interface Hub {
  /** Takes a connection whose opening passed the door, and serves it from now on. */
  attach(socket: Socket, opened: LiveOpened): void
  /** Is told the tables and the rows that a committed write touched, and `every` where the write names neither. */
  wrote(touched: Touched[], every: boolean): void
  /** Answers the versions that a watch of an open connection names. */
  watched(): Set<string>
  /**
   * Is told that another version runs now, and which versions can be loaded no more. In the mode `development`
   * every open page is told the version, and the watches of the versions it left are dropped: the page sends them
   * again under the new one. In the other modes a page that watched under a version which is gone is told to
   * reload, and any other is told nothing. In development a switch of a save of the look alone tells each page the
   * modules it takes in place, and moves the watches to the new version, which the page sends no more; one with
   * `reload` has each page load its address anew.
   */
  switched(version: string, dropped: string[], told?: SwitchTold): void
  /** In the mode `development`: sends every open page what the build and the check found. */
  show(findings: object[]): void
  /** The machine is a reader that is not current any more: every connection is closed, and the hub stays for the next ones. */
  behind(): void
  /** Answers once every group that a write marked was run and answered, within that many milliseconds at most. */
  idle(within: number): Promise<void> | undefined
  /** How many connections are open: an app with one is in use, and does not sleep. */
  open(): number
  /** Is told that a session has ended: each connection that was opened with it is told that its caller changed, and closed. */
  ended(session: string): void
  /** Is told what the runner tells of a run: the pages that follow it are sent its parts. */
  told(what: Told): void
  /** Closes every connection, and takes every timer back. */
  close(): void
}

/**
 * Takes what the engine holds of an app. Loads the messages of the live connection, and answers the hub of the
 * app, which the app is told of: from now on each committed write marks the groups that read what it touched.
 */
export async function makeHub(o: Opened): Promise<Hub> {
  const messages = new Map<string, LiveMessage>()
  for (const one of list) {
    const { message } = await one.load()
    messages.set(message.t, message)
  }
  const connections = new Set<Connected>()
  let stopBeat: (() => void) | undefined
  let closed = false

  /** Closes a connection: its watches are over, and its address holds one connection less. */
  const shut = (c: Connected): void => {
    if (c.closed) return
    c.closed = true
    c.socket.close()
    connections.delete(c)
    for (const watch of [...c.watches.values()]) groups.leave(watch)
    runs.closed(c)
    c.opened.release()
    c.stop?.()
    // The time a connection stood open is counted when it closes, by the clock of the app.
    gather(o, 'live', { liveSeconds: (o.clock.now() - c.at) / 1000 }, { caller: c.opened.caller() })
    if (connections.size) return
    stopBeat?.()
    stopBeat = undefined
  }

  /** Sends one message, written as JSON, and closes a connection that does not take what it is sent. */
  const tell = (c: Connected, text: string): void => {
    if (c.closed) return
    c.socket.send(text)
    gather(o, 'live', { bytesOut: Buffer.byteLength(text) }, { caller: c.opened.caller() })
    if (c.socket.waiting() > storedLimit(o.description, 'liveWaitingSize')) shut(c)
  }

  const changed = (c: Connected): void => {
    tell(c, '{"t":"changed"}')
    shut(c)
  }

  const groups = groupsOf(o, { tell, changed })
  // In the mode `test` each connection is told the write that its watches hold, once the groups have run.
  const heard = heardOf(o, () => groups.idle(60_000), tell)
  const runs = runsOf(o, tell, (c) => c.opened.caller())
  // The text of a run as it grows is part of what `working` answers: the groups of its caller and its conversation
  // run again, `limits.textPerSecond` times a second at most.
  let marking: NodeJS.Timeout | undefined
  const growing = new Set<string>()
  hearParts(o, (run, part) => {
    runs.part(run, part)
    if (closed) return
    growing.add(run)
    marking ??= setTimeout(
      () => {
        marking = undefined
        for (const one of growing) groups.ran(one)
        growing.clear()
      },
      1000 / Math.max(1, storedLimit(o.description, 'textPerSecond')),
    )
  })

  /** Reads one frame of a connection: one JSON object in a text frame, with the name of a known message in `t`. */
  const messageIn = (c: Connected, frame: Frame): { message: object; handler: LiveMessage } | undefined => {
    const now = performance.now()
    if (now - c.since >= 1000) {
      c.since = now
      c.count = 0
    }
    if (++c.count > storedLimit(o.description, 'liveMessages')) return undefined
    if (typeof frame !== 'string' || Buffer.byteLength(frame) > limitOf(o.description, 'callSize')) return undefined
    let read: unknown
    try {
      read = JSON.parse(frame)
    } catch {
      return undefined
    }
    if (typeof read !== 'object' || read === null || Array.isArray(read)) return undefined
    // The name of a message is a text: a list or a number that reads as one names none.
    const t: unknown = Reflect.get(read, 't')
    const handler = typeof t === 'string' ? messages.get(t) : undefined
    return handler ? { message: read, handler } : undefined
  }

  /** Takes one frame of a connection. A frame that is no message of a page, and one message too many, close it. */
  const took = (c: Connected, frame: Frame): void => {
    if (c.closed) return
    const read = messageIn(c, frame)
    if (!read) {
      shut(c)
      return
    }
    // Nothing that is thrown while a frame is handled leaves here: its connection is closed, and the engine goes on.
    try {
      read.handler.handle(c.face, read.message)
      heard.told([c])
    } catch {
      shut(c)
    }
  }

  /** Sends every connection a sign of life each 30 seconds, and closes one whose answer did not come within 15. */
  const keepAlive = (): void => {
    const cancels: (() => void)[] = []
    const next = (): void => {
      cancels[0] = o.clock.setTimer(o.clock.now() + beat, () => {
        for (const c of [...connections]) {
          c.due = true
          tell(c, '{"t":"alive"}')
        }
        cancels[1] = o.clock.setTimer(o.clock.now() + answerTime, () => {
          for (const c of [...connections]) if (c.due) shut(c)
        })
        next()
      })
    }
    next()
    stopBeat = () => {
      for (const cancel of cancels) cancel()
    }
  }

  const hub: Hub = {
    attach(socket, opened) {
      if (closed || o.closed) {
        socket.close()
        opened.release()
        return
      }
      const caller = opened.caller()
      const c: Connected = {
        socket,
        opened,
        who: callerText(caller),
        watches: new Map(),
        count: 0,
        since: performance.now(),
        at: o.clock.now(),
        due: false,
        closed: false,
        turn: -1,
        face: {
          watch: (asked) => {
            gather(o, 'live', { watches: 1 }, { caller: c.opened.caller() })
            groups.watch(c, asked)
          },
          runWatch: (asked) => runs.watch(c, asked, c.opened.caller()),
          unwatch: (id) => {
            const held = c.watches.get(id)
            if (held) groups.leave(held)
            else runs.leave(c, id)
          },
          alive: () => {
            c.due = false
          },
          heard: () => heard.asked(c),
          // A view that failed in the browser, which a page in development tells.
          thrown: (message) => {
            if (o.mode === 'development')
              void import('../failed/shown.ts').then((one) => one.failedInBrowser(o, message)).catch(() => undefined)
          },
          close: () => shut(c),
        },
      }
      connections.add(c)
      // The most connections that stood open at one time: a level, which is never added.
      gather(o, 'live', { livePeak: connections.size }, { peak: true })
      if (!stopBeat) keepAlive()
      // A page names the user it was drawn for: one whose caller is another is told so, and closed.
      if (opened.as !== caller.user?.id) {
        changed(c)
        return
      }
      // A caller that the project's own code named is asked for anew after a while: the connection is closed at
      // that moment, and the page opens it again.
      const { until } = opened
      if (until !== undefined) c.stop = o.clock.setTimer(until, () => shut(c))
      // A page that opens while something is wrong with the project shows it as the pages before it do.
      if (o.mode === 'development' && failuresShown(o).length)
        tell(c, JSON.stringify({ t: 'findings', findings: failuresShown(o) }))
      // A page drawn before a switch that it opened too late to hear is told the version that runs, and follows it.
      if (o.mode === 'development' && opened.version !== undefined && opened.version !== o.version)
        tell(c, `{"t":"version","version":${JSON.stringify(o.version)}}`)
      socket.each(
        (frame) => took(c, frame),
        () => shut(c),
      )
    },
    wrote(touched, every) {
      groups.wrote(touched, every)
      heard.told(connections)
    },
    watched: () => groups.watched(),
    switched(version, dropped, told) {
      if (o.mode === 'development') {
        // The pages of a save of the look alone keep what they watch: their watches go on under the new version.
        if (told && 'swap' in told) groups.moved(version)
        else groups.left((one) => one === version)
        const message =
          told && 'reload' in told
            ? { t: 'reload' }
            : { t: 'version', version, ...(told && 'swap' in told ? { swap: told.swap } : {}) }
        const text = JSON.stringify(message)
        for (const c of [...connections]) tell(c, text)
      } else if (dropped.length) groups.left((one) => !dropped.includes(one), '{"t":"reload"}')
    },
    show(findings) {
      const told = JSON.stringify({ t: 'findings', findings })
      for (const c of [...connections]) tell(c, told)
    },
    ended(session) {
      for (const c of [...connections]) if (c.opened.session === session) changed(c)
    },
    behind() {
      for (const c of [...connections]) shut(c)
    },
    idle: (within) => groups.idle(within),
    open: () => connections.size,
    told(what) {
      runs.told(what)
      groups.ran(what.run)
    },
    close() {
      closed = true
      clearTimeout(marking)
      runs.close()
      groups.close()
      for (const c of [...connections]) shut(c)
    },
  }
  o.hub = hub
  if (o.closed) hub.close()
  return hub
}
