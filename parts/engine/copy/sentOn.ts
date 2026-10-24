import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import type { Opened } from '../opened.ts'
import { asAsked, underwayNow, isNeedsWriter, needsWriter, newAsked } from './asked.ts'
import { notReached } from './reach.ts'

/** The members of an app that only the writer carries out, by the name they are sent on under. */
export type Member = 'call' | 'write' | 'seed' | 'read' | 'page' | 'start' | 'runs' | 'session'

/**
 * Takes a reader, a member of its app that code asked it for, the arguments, and the caller that the code named.
 * On test data the reader sends it to its writer, which carries it out as that caller, and answers what the
 * writer answered, or throws what it failed with. On live data it throws T0030: a writer takes no caller on a
 * reader's word.
 */
export async function sentOn(o: Opened, member: Member, args: unknown[], as: Caller): Promise<unknown> {
  const reader = o.machine.reader
  if (!reader || o.mode === 'live') throw needsWriter(`\`app.${member}\` of what writes`, reader?.writer())
  const address = reader.writer()
  const sent = new Request(`${address}/_t/copy/do`, {
    method: 'POST',
    headers: { authorization: `Bearer ${reader.reads.key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ member, args, as }),
  })
  let read: unknown
  try {
    read = await (await o.machine.reached(address).request(sent)).json()
  } catch (error) {
    throw notReached(address, error instanceof Error ? error.message : String(error))
  }
  const answer = Object(read)
  if (answer.ok === true) return answer.value ?? undefined
  const failed = Object(answer.error)
  throw new TentError(String(failed.code ?? 'T0009'), String(failed.message ?? 'The writer failed.'), {
    ...(typeof failed.fix === 'string' ? { fix: failed.fix } : {}),
    ...(typeof failed.fields === 'object' && failed.fields !== null ? { fields: failed.fields } : {}),
  })
}

/**
 * Takes an app, a member of it that a program asked for, with its arguments and its caller, whether it only
 * reads, and what carries it out on this machine. Carries it out as the machines of the app do: a writer answers
 * once what the answer rests on is settled; a reader answers a read itself while it is current, and sends
 * everything else, and a read that met the writer's work after all, to its writer.
 */
export async function asMachine(
  o: Opened,
  member: Member,
  args: unknown[],
  as: Caller,
  reads: boolean,
  work: () => unknown,
): Promise<unknown> {
  const { machine } = o
  // A writer that has a lease asks it before a write where its last yes ran out, readers or none.
  if (machine.writer?.leases()) await machine.writer.ready()
  if (!machine.many()) return work()
  // What a request carries out, and what a call of the app calls, is answered with that request or that call.
  if (underwayNow()) return work()
  if (machine.reader && (!reads || !machine.reader.current())) return sentOn(o, member, args, as)
  if (machine.writer) {
    await machine.writer.ready()
    if (!reads) machine.writes(`app.${member}`)
  }
  const asked = newAsked()
  try {
    const answer = await asAsked(asked, async () => work())
    // What met the writer's work is the writer's, also where the code of the app caught the error that said so.
    if (machine.reader && asked.needs) return sentOn(o, member, args, as)
    await machine.leaves(asked)
    return answer
  } catch (error) {
    if (machine.reader && (asked.needs || isNeedsWriter(error))) return sentOn(o, member, args, as)
    throw error
  }
}
