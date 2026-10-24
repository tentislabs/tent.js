// The three commands of the admin channel that an app which sleeps answers without waking.
import type { Plan } from '../../core/internal.ts'
import { programUsed } from '../counts/program.ts'
import { countsCallerHeld, countsPlan } from '../counts/readAlone.ts'
import { adminWords } from '../door/adminAsked.ts'
import { callerNamed } from '../program.ts'
import type { About } from '../web/proxy.ts'
import { jsonAnswer, okAnswer, wireError } from '../wire.ts'

/** What an app that sleeps answers the three with: its token, its folder, and what it kept. */
export interface AsleepHeld {
  token: string
  dataFolder: string
  // The most bytes of the body of a command.
  size: number
  dueAt(): number | undefined
  counts(plan: Plan): unknown
}

/**
 * Takes a request for an app that sleeps, what the engine knows of where it came from, and what the app kept.
 * Answers the answer of `asleep`, `program`, or `read` of the counts, held to the token as the channel holds every
 * command, and nothing for any other request, which wakes the app: `asleep` answers `{ asleep: true, dueAt? }`
 * as `asleep.json` holds it.
 */
export async function asleepAdmin(request: Request, about: About, held: AsleepHeld): Promise<Response | undefined> {
  const { pathname } = new URL(request.url)
  if (request.method !== 'POST' || !/^\/_t\/admin\/(asleep|program|read)$/.test(pathname)) return undefined
  const name = pathname.slice('/_t/admin/'.length)
  try {
    // A read of anything but the counts wakes the app, which is handed the request whole.
    const args = await adminWords(name === 'read' ? request.clone() : request, about, held.token, held.size)
    if (name === 'asleep') {
      const dueAt = held.dueAt()
      return okAnswer({ asleep: true, ...(dueAt === undefined ? {} : { dueAt }) })
    }
    if (name === 'program') return okAnswer(programUsed(() => [held.dataFolder]))
    const plan = countsPlan(args.plan)
    if (!plan) return undefined
    countsCallerHeld(callerNamed(args.as ?? 'system'))
    return okAnswer(held.counts(plan) ?? null)
  } catch (error) {
    const { status, error: sent } = wireError(error, true, { command: true })
    return jsonAnswer(status, { ok: false, error: sent })
  }
}
