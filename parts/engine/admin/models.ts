import { boolean, TentError } from '../../core/index.ts'
import { knownModel } from '../../core/internal.ts'
import type { Admin } from '../admin.ts'
import { wordOf } from '../admin.ts'
import { appModelCall } from '../ai/appCall.ts'
import type { Opened } from '../opened.ts'
import { putFile, streamOf } from '../stored/files.ts'

const system = { kind: 'system' } as const

/** A tenth of a second of silence, as the bytes of a WAV file: what `hear` is asked to hear. */
function silence(): Uint8Array {
  const samples = 1600
  const bytes = Buffer.alloc(44 + samples, 128)
  bytes.write('RIFF', 0)
  bytes.writeUInt32LE(36 + samples, 4)
  bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(16000, 24)
  bytes.writeUInt32LE(16000, 28)
  bytes.writeUInt16LE(1, 32)
  bytes.writeUInt16LE(8, 34)
  bytes.write('data', 36)
  bytes.writeUInt32LE(samples, 40)
  return new Uint8Array(bytes)
}

/** What one small request of a fixed call tells: whether its server answered it, and the code where it did not. */
async function tried(
  call: () => Promise<unknown> | undefined,
): Promise<{ ok: boolean; code?: string; message?: string }> {
  try {
    await call()
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      code: String(Reflect.get(Object(error), 'code') ?? 'T0009'),
      message: String(Reflect.get(Object(error), 'message') ?? error),
    }
  }
}

/** The small requests of one model, one for each fixed call it has, and whether its reasoning arrived. */
async function triedModel(o: Opened, name: string): Promise<object> {
  const model = o.description.models[name]
  const abilities = knownModel(model).abilities ?? []
  const call = (method: string, args: unknown[]): Promise<unknown> | undefined =>
    appModelCall(o, `${name}.${method}`, args, system)
  let reasoning = false
  const calls: Record<string, object> = {}
  if (abilities.includes('reply'))
    calls.reply = await tried(() =>
      call('reply', [
        'Answer with the word OK.',
        {
          reasoning: () => {
            reasoning = true
          },
        },
      ]),
    )
  if (abilities.includes('typedAnswers'))
    calls.fill = await tried(() => call('fill', [{ ok: boolean() }, 'Answer that this works: ok is true.']))
  if (abilities.includes('embed')) calls.embed = await tried(() => call('embed', ['A test.']))
  if (abilities.includes('hear')) {
    const file = await putFile(o, streamOf(silence()), { name: 'silence.wav', kind: 'audio/wav', by: 'system' })
    calls.hear = await tried(() => call('hear', [file.id]))
  }
  if (abilities.includes('speak')) calls.speak = await tried(() => call('speak', ['OK.']))
  return { name, calls, ...(abilities.includes('reasoning') ? { reasoning } : {}) }
}

/**
 * `tent models test [name]`: sends one small request for each fixed call that a model of the app has, or the one
 * that `name` names, to its real server, as the system, and answers for each model which calls its server answered,
 * with the code of each that it did not, and whether the reasoning of a model that gives it arrived.
 */
export const admin: Admin = {
  name: 'models',
  async run(o, args) {
    const names = Object.keys(o.description.models)
    const named = Reflect.get(args, 'name') === undefined ? undefined : wordOf(args, 'name', 'the name of a model')
    if (named !== undefined && !names.includes(named))
      throw new TentError('T0001', `No model named ${named} can be reached.`, {
        fix: '`tent models` lists the models of the app.',
      })
    const tried: object[] = []
    for (const name of named === undefined ? names : [named]) tried.push(await triedModel(o, name))
    return tried
  },
}
