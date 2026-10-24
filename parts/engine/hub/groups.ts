import type { Caller, WireError } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import type { Touched } from '../../data/index.ts'
import { answeringSince, nextRequest } from '../answering.ts'
import { called } from '../door/call.ts'
import { failureOf } from '../door/failure.ts'
import { storedLimit } from '../limits.ts'
import { answerMark } from '../mark.ts'
import type { Opened } from '../opened.ts'
import { servedBy, versionGone } from '../versions.ts'
import type { TablesRead } from '../watched.ts'
import { fileNoted, reading, tableNoted } from '../watched.ts'
import { wireError } from '../wire.ts'
import type { Watching } from './connection.ts'
import type { Connected, Group, Watch } from './held.ts'
import { changedIn, listedIn } from './rows.ts'
import { standingOf } from './standing.ts'
import { isLiveMember } from '../ai/members.ts'
import { asPiece } from '../counts/cpu.ts'
import { byOfCaller, startedBy } from '../flows/words.ts'
import { callerText } from '../../data/index.ts'

// The times of the runs, in milliseconds. A page and the engine must agree on them, so no project changes one.
const gather = 5
const turnTime = 10

/** The groups of the watches of one app: each is run for its watches, and again when a write touched what it read. */
export interface Groups {
  /** Takes a watch of a connection, and runs its group at once. A watch that cannot be is answered `failed`. */
  watch(c: Connected, asked: Watching): void
  /** Takes a watch away, and with the last watch of a group the group. */
  leave(watch: Watch): void
  /** The versions that the watches name. */
  watched(): Set<string>
  /**
   * Ends every watch of a version that `keeps` does not keep, with no word to its page but `told`, which each
   * connection that held such a watch is sent once.
   */
  left(keeps: (version: string) => boolean, told?: string): void
  /**
   * Moves every watch that names another version to `version`, with what its group last answered: in development,
   * where a page took a save of the look alone in place and goes on watching what it watched.
   */
  moved(version: string): void
  /**
   * Marks the groups that read what a committed write touched, and every group where `every` says so. A group
   * that watches `working` is marked by `ran` alone, and by no table write but one that marks every group.
   */
  wrote(touched: Touched[], every: boolean): void
  /** Marks each group that watches `working` for the caller who started that run, or for its conversation. */
  ran(run: string): void
  /**
   * Answers once no group waits for its run and none is under way, within that many milliseconds at most, and
   * nothing where that holds already.
   */
  idle(within: number): Promise<void> | undefined
  /** Takes back the timer of the runs: no group is run from now on. */
  close(): void
}

/** What the groups ask of the hub that holds the connections. */
export interface Telling {
  /** Sends a connection one message, written as JSON. */
  tell(c: Connected, text: string): void
  /** Tells a page that its caller is no longer the one it was drawn for, and closes its connection. */
  changed(c: Connected): void
}

// How deep the input of a watch may be nested: far deeper than any input that a query takes, and far less than
// what a function that calls itself can walk.
const deepest = 64

/**
 * A value written as JSON with the keys of every record in one order, so that one input is one text. Throws T0002
 * for a value that is nested deeper than an input may be.
 */
function ordered(value: unknown, depth = 0): string {
  if (typeof value !== 'object' || value === null) return JSON.stringify(value) ?? 'null'
  if (depth >= deepest)
    throw new TentError('T0002', `The input of a watch is nested more than ${deepest} deep.`, {
      fix: 'Watch a query with the input that it takes.',
    })
  if (Array.isArray(value)) return `[${value.map((one) => ordered(one, depth + 1)).join(',')}]`
  const record: Record<string, unknown> = { ...value }
  const keys = Object.keys(record).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${keys.map((key) => `${JSON.stringify(key)}:${ordered(record[key], depth + 1)}`).join(',')}}`
}

/** Whether what a group read was touched by a write. A table that is named with no row was written in rows that are not known. */
function touches(reads: TablesRead, touched: Touched[]): boolean {
  for (const { table, ids, file } of touched) {
    // A write of a tenant's file touches the groups that read that table in that file, and those that named the
    // file as a whole. Where the write names no table, it touches every group that read anything in the file.
    if (file) {
      const whole = fileNoted(file)
      if (reads.has(whole)) return true
      if (table === '') {
        for (const noted of reads.keys()) if (noted.startsWith(`${whole} `)) return true
        continue
      }
    }
    const read = reads.get(file ? tableNoted(file, table) : table)
    if (read === undefined) continue
    if (read === 'all' || !ids.length || ids.some((id) => read.has(id))) return true
  }
  return false
}

const refusal = (code: string, words: string, fix: string): TentError => new TentError(code, words, { fix })

/** Takes what the engine holds of an app, and what the hub does for the groups. Answers the groups of the app, which hold none yet. */
export function groupsOf(o: Opened, { tell, changed }: Telling): Groups {
  const groups = new Map<string, Group>()
  // The groups that wait for their run, in the order in which they were marked.
  let waiting: Group[] = []
  let timer: NodeJS.Timeout | undefined
  let sweeping = false
  let turn = 0
  let closed = false
  const standing = standingOf(o)

  /** What a caller sees of an error of a watch. */
  const seen = (name: string, error: unknown): WireError => {
    const { ref } = failureOf(o, name, error)
    return wireError(error, o.mode !== 'live', { ...(ref ? { ref } : {}), running: o.version }).error
  }

  /** The caller of a connection as they are now, built once for each turn of the hub. */
  const callerOf = (c: Connected): Caller => {
    if (c.turn !== turn || !c.built) {
      c.built = c.opened.caller()
      c.turn = turn
    }
    return c.built
  }

  const leave = (watch: Watch): void => {
    const { group, on } = watch
    if (on.watches.get(watch.id) === watch) on.watches.delete(watch.id)
    group.watches.delete(watch)
    if (group.watches.size) return
    group.cancel?.()
    group.marked = false
    if (groups.get(group.key) === group) groups.delete(group.key)
  }

  /** A watch of a group failed: each page is told what its caller sees of the error, and the watch is over. */
  const failed = (group: Group, error: unknown): void => {
    const told = JSON.stringify(seen(group.query, error))
    for (const watch of [...group.watches]) {
      tell(watch.on, `{"t":"failed","id":${JSON.stringify(watch.id)},"error":${told}}`)
      leave(watch)
    }
  }

  /**
   * A run of a group answered. Each page that does not hold this answer is sent it: what changed, where the page
   * holds the answer that was sent last and both are lists of rows, and the whole answer otherwise.
   */
  const answered = (group: Group, value: unknown, reads: TablesRead, at: string | undefined): void => {
    group.reads = reads
    const text = JSON.stringify(value)
    const mark = answerMark(text)
    const listed = listedIn(value)
    const { mark: was, kept } = group
    // The write that the answer was worked out at, on an app that has a reader or is one.
    const stands = at === undefined ? '' : `,"at":"${at}"`
    // What a `rows` message holds after its id: false where the answer is sent whole.
    const rowsNow = (): string | false => {
      if (was === undefined || !kept || !listed || group.page !== listed.page) return false
      const { put, removed } = changedIn(kept, listed.kept)
      // The entries of `working` travel one by one, as the text of one grows.
      if (put.length > listed.kept.ids.length / 2 && !group.member) return false
      const puts = put.map((place) => {
        const after = place > 0 ? `,"after":${JSON.stringify(listed.kept.ids[place - 1])}` : ''
        return `{"row":${listed.texts[place]}${after}}`
      })
      const next = listed.next === undefined ? '' : `,"next":${listed.next}`
      return `,"was":"${was}","mark":"${mark}"${stands},"put":[${puts.join(',')}],"removed":${JSON.stringify(removed)}${next}}`
    }
    // It is worked out for the first page that needs it, and once.
    let rows: string | false | undefined
    const whole = `${text === undefined ? '' : `,"value":${text}`},"mark":"${mark}"${stands}}`
    for (const watch of [...group.watches]) {
      if (watch.holds === mark || watch.waiting) continue
      const id = JSON.stringify(watch.id)
      const builds = was !== undefined && watch.holds === was
      if (builds) rows ??= rowsNow()
      watch.holds = mark
      tell(watch.on, builds && rows ? `{"t":"rows","id":${id}${rows}` : `{"t":"result","id":${id}${whole}`)
    }
    group.mark = mark
    group.kept = listed?.kept
    group.page = listed?.page
  }

  /** Marks a group: it is run a moment after the first mark, so that writes which land together cause one run. */
  const mark = (group: Group): void => {
    if (group.marked) return
    group.marked = true
    waiting.push(group)
    if (!sweeping && !timer && !closed) timer = setTimeout(sweep, gather)
  }

  /** A run of a group that answered a promise ended: a write that was committed meanwhile runs the group once more. */
  const ended = (group: Group): void => {
    group.running = false
    if (!group.again) return
    group.again = false
    if (group.watches.size) mark(group)
  }

  /**
   * Asks the writer for the answer of a group whose query met what only the writer can do here - a sealed value
   * that the key of this reader does not open, a secret that has no value here - as the read that the page of its
   * first watch would send, and sends that. What it read is not known here: any write marks the group again.
   */
  const throughWriter = async (group: Group, first: Watch, error: unknown, at: string | undefined): Promise<void> => {
    group.running = true
    try {
      const [{ isNeedsWriter }, { readOnWriter }] = await Promise.all([
        import('../copy/asked.ts'),
        import('../copy/door.ts'),
      ])
      if (!isNeedsWriter(error)) throw error
      const value = await readOnWriter(o, first.on.opened, group.query, group.input)
      const everything: TablesRead = new Map(Object.keys(o.description.tables).map((name) => [name, 'all']))
      if (group.watches.size) answered(group, value, everything, at)
    } catch (failure) {
      failed(group, failure)
    } finally {
      ended(group)
    }
  }

  /**
   * Runs a group: the caller is built again, as they are today, and the query passes steps 5 to 10 of the door
   * again. A page whose caller is another one now is told so and closed.
   */
  const run = (group: Group): void => {
    if (group.running) {
      group.again = true
      return
    }
    group.marked = false
    for (const watch of [...group.watches]) if (callerText(callerOf(watch.on)) !== group.who) changed(watch.on)
    const [first] = group.watches
    if (!first) return
    // A watch is served by the version it names for as long as that one can be loaded, whichever runs.
    const served = group.version === '' ? o : servedBy(o, group.version)
    if (!served) {
      failed(group, versionGone(group.version))
      return
    }
    const caller = callerOf(first.on)
    const stands = standing.at()
    let read: { answer: unknown; reads: TablesRead }
    try {
      // Making a watched query anew is the work of live data, which its processor time is booked to.
      read = asPiece(o, 'live', caller, () => reading(() => called(served, group.query, group.input, { caller })))
    } catch (error) {
      // On a reader, a watched query that meets what only the writer can do is asked of the writer.
      if (o.machine.reader) return void throughWriter(group, first, error, stands?.text)
      failed(group, error)
      return
    }
    const { answer, reads } = read
    // No answer leaves before the write it rests on is settled: on a machine that is closed first it never leaves.
    const settled =
      stands &&
      standing.settled(stands.n)?.then(
        () => true,
        () => false,
      )
    if (!(answer instanceof Promise) && !settled) {
      answered(group, answer, reads, stands?.text)
      return
    }
    // A heavy query answers from its thread: what it read there is told with its answer.
    group.running = true
    Promise.all([answer, settled]).then(
      ([value, leaves]) => {
        if (group.watches.size && leaves !== false) answered(group, value, reads, stands?.text)
        ended(group)
      },
      (error) => {
        failed(group, error)
        ended(group)
      },
    )
  }

  /**
   * Lets the calls that wait go first: the requests that arrived during a stretch of runs are taken in, and are
   * answered before the runs go on. A request that is not answered within one more stretch waits for something
   * else than the hub, and the runs go on beside it.
   */
  const letThrough = (since: number, then: () => void): void => {
    const paused = performance.now()
    const look = (): void => {
      if (answeringSince(o, since) && performance.now() - paused < turnTime) setImmediate(look)
      else then()
    }
    setImmediate(look)
  }

  /** Runs the groups that wait, in turn: after each stretch of runs the calls that wait go first. */
  function sweep(): void {
    timer = undefined
    sweeping = true
    const began = performance.now()
    const since = nextRequest(o)
    turn++
    let at = 0
    while (at < waiting.length) {
      const group = waiting[at++]
      if (group.marked) run(group)
      if (performance.now() - began >= turnTime && at < waiting.length) {
        waiting = waiting.slice(at)
        letThrough(since, sweep)
        return
      }
    }
    waiting = []
    sweeping = false
  }

  /** Has a query that states `refresh` run again on that timer, by the clock of the app, for as long as it is watched. */
  const refreshed = (group: Group, every: number): void => {
    const next = (): void => {
      group.cancel = o.clock.setTimer(o.clock.now() + every, () => {
        if (closed || !group.watches.size) return
        mark(group)
        next()
      })
    }
    next()
  }

  /** Answers why a watch cannot be, before anything is run for it, or nothing where it can. */
  const refusedFor = (c: Connected, asked: Watching, served: Opened | undefined): TentError | undefined => {
    const most = storedLimit(o.description, 'watches')
    if (c.watches.size >= most)
      return refusal(
        'T0005',
        `One live connection holds ${most} watches, and one more was asked for.`,
        'Watch fewer queries on one page, or raise `watches` in `project.limits`.',
      )
    if (!served) return versionGone(asked.version)
    const { query } = asked
    // A frame of a chat app watches only what its screen's answer read.
    if (c.opened.only && !(typeof query === 'string' && c.opened.only.includes(query)))
      return refusal('T0006', 'The pass of this frame watches no other query.', 'Watch what the screen reads.')
    const record =
      typeof query === 'string' && Object.hasOwn(served.description.functions, query)
        ? served.description.functions[query]
        : undefined
    // `working` of an agent is a live query that the engine answers.
    if (typeof query === 'string' && isLiveMember(served, query)) return undefined
    if (record?.kind !== 'query' || record.live === false)
      return refusal(
        'T0001',
        `No live query named ${(JSON.stringify(query) ?? 'nothing').slice(0, 80)} can be watched.`,
        'Watch a query of the app that does not state `live: false`: `tent map` lists them.',
      )
    return undefined
  }

  return {
    watch(c, asked) {
      turn++
      const refuse = (error: unknown): void => {
        // The name of a query is a text: anything else names none, and is read as nothing.
        const named = typeof asked.query === 'string' ? asked.query : ''
        const told = JSON.stringify(seen(named, error))
        tell(c, `{"t":"failed","id":${JSON.stringify(asked.id)},"error":${told}}`)
      }
      // A second watch under an id that is still watched takes its place.
      const before = c.watches.get(asked.id)
      if (before) leave(before)
      // A watch names the version of its page, and is served by that version while it can be loaded.
      const served = servedBy(o, asked.version)
      const query = typeof asked.query === 'string' ? asked.query : ''
      const refused = refusedFor(c, asked, served)
      if (refused || !served) {
        refuse(refused)
        return
      }
      // A watch that names no version follows the running one, whichever that is: its group belongs to no version.
      const version = typeof asked.version === 'string' ? served.version : ''
      const who = callerText(callerOf(c))
      if (who !== c.who) {
        changed(c)
        return
      }
      // An input is one text for its group: one that is nested deeper than any input of a query is refused, with
      // nothing run.
      let input: string
      try {
        input = ordered(asked.input)
      } catch (error) {
        refuse(error)
        return
      }
      const key = `${version} ${query} ${who} ${input}`
      let group = groups.get(key)
      if (!group) {
        const all = storedLimit(o.description, 'groups')
        if (groups.size >= all) {
          refuse(
            refusal(
              'T0005',
              `The app holds ${all} groups of watches, and one more was asked for.`,
              'Raise `groups` in `project.limits`.',
            ),
          )
          return
        }
        const [watches, idle] = [new Set<Watch>(), { marked: false, running: false, again: false }]
        group = {
          key,
          version,
          query,
          input: asked.input,
          who,
          watches,
          ...idle,
          ...(isLiveMember(served, query) ? { member: true as const } : {}),
        }
        groups.set(key, group)
        const every: unknown = Reflect.get(Object(served.description.functions[query]), 'refresh')
        if (typeof every === 'number' && every > 0) refreshed(group, every)
      }
      const mine: Watch = { id: asked.id, on: c, group, ...(asked.have === undefined ? {} : { holds: asked.have }) }
      group.watches.add(mine)
      c.watches.set(asked.id, mine)
      // A watch whose page has seen a write that this machine does not hold yet is answered once it holds it.
      const held = standing.holds(asked.seen)
      if (!held) {
        run(group)
        return
      }
      mine.waiting = true
      void held.then(() => {
        delete mine.waiting
        if (!group.watches.has(mine) || closed) return
        // However long the watch waited, its run builds the caller again: what they were when it arrived is old.
        turn++
        run(group)
      })
    },
    leave,
    watched: () => new Set([...groups.values()].map((group) => group.version)),
    left(keeps, told) {
      const gone = new Set<Connected>()
      for (const group of [...groups.values()]) {
        if (group.version === '' || keeps(group.version)) continue
        for (const watch of [...group.watches]) {
          gone.add(watch.on)
          leave(watch)
        }
      }
      if (told) for (const c of gone) tell(c, told)
    },
    moved(version) {
      for (const group of [...groups.values()]) {
        if (group.version === '' || group.version === version) continue
        groups.delete(group.key)
        const key = `${version}${group.key.slice(group.version.length)}`
        const there = groups.get(key)
        // A group of the same query, input and caller under the new version takes the watches in.
        if (there) {
          for (const watch of group.watches) {
            watch.group = there
            there.watches.add(watch)
          }
          group.cancel?.()
          continue
        }
        group.key = key
        group.version = version
        groups.set(key, group)
      }
    },
    wrote(touched, every) {
      for (const group of groups.values()) {
        if (group.member && !every) continue
        if (group.running) group.again = true
        else if (!group.marked && (every || !group.reads || touches(group.reads, touched))) mark(group)
      }
    },
    ran(run) {
      const runs = o.flows?.runner ?? o.runsRead
      const one = runs?.read(run)
      const top = one && one.top !== one.id ? runs?.read(one.top) : one
      if (!top) return
      for (const group of groups.values()) {
        const [first] = group.watches
        if (!group.member || !first) continue
        // A step that one run saves costs the other open chats nothing: only its own caller's and conversation's run again.
        const thread: unknown = Reflect.get(Object(group.input), 'thread')
        const theirs =
          (top.thread !== undefined && thread === top.thread) ||
          startedBy(top.startedBy, byOfCaller(callerOf(first.on)))
        if (!theirs) continue
        if (group.running) group.again = true
        else mark(group)
      }
    },
    idle(within) {
      const busy = (): boolean => {
        if (timer !== undefined || sweeping) return true
        for (const group of groups.values()) if (group.running || group.marked) return true
        return false
      }
      if (!busy()) return undefined
      const began = performance.now()
      return new Promise((done) => {
        const look = (): void => {
          if (closed || !busy() || performance.now() - began >= within) done()
          else setTimeout(look, 1)
        }
        look()
      })
    },
    close() {
      closed = true
      clearTimeout(timer)
    },
  }
}
