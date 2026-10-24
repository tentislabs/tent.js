import { TentError } from '../core/index.ts'
import { openHistory } from '../history/index.ts'
import { startDev } from './dev.ts'
import { writes } from './historyBranches.ts'
import { pushed } from './pushed.ts'
import { historyWork } from './historyWork.ts'
import { askedOfOwn, askedOfRunning, dataFolderOf } from './reach.ts'

/**
 * What a command of the history answers, or the failure it was refused with, thrown: such a command ends with 2. A
 * session answers why it refused to go back as `refused`, with its code.
 */
function valueOf(answered: { value?: unknown; findings?: { code: string; message: string; fix?: string }[] }): unknown {
  const sent: unknown =
    typeof answered.value === 'object' && answered.value !== null ? Reflect.get(answered.value, 'refused') : undefined
  const [refused] = typeof sent === 'object' && sent !== null ? [Object(sent)] : (answered.findings ?? [])
  if (refused)
    throw new TentError(
      String(refused.code),
      String(refused.message),
      typeof refused.fix === 'string' ? { fix: refused.fix } : {},
    )
  return answered.value
}

/**
 * Takes the folder of a project with the data folder that `--data` named, if any, and the words of a command of
 * `tent history` by their names. Where `tent dev` runs the project, it holds the history open, and the command
 * asks it over the admin channel. Where none runs, the command opens the history itself. Going back, a switch, a
 * merge and a settle with none running start a session of development for the length of the command, since the
 * data follows the files and what was written is built and checked.
 * Answers the value of the command, and throws what it was refused with.
 */
export async function historyAsked(
  o: { folder: string; data?: unknown },
  args: Record<string, unknown> & { what: string },
): Promise<unknown> {
  const running = await askedOfRunning(o, 'history', args)
  // An engine that is no session of development has no command of the history, and holds none open.
  const holdsNone = running?.findings?.some(
    (one) => one.code === 'T0001' && one.message.startsWith('The engine has no command "history'),
  )
  if (running && !holdsNone) return valueOf(running)
  if (args.what === 'back' || writes(args)) {
    const dev = await startDev(o.folder, { port: 0, out: () => undefined })
    try {
      return valueOf(await askedOfOwn(dev.app(), dataFolderOf(o), 'history', args))
    } finally {
      await dev.close()
    }
  }
  const history = openHistory(dataFolderOf(o))
  try {
    return args.what === 'push' ? await pushed(history, o.folder, args) : historyWork(history, o.folder, args)
  } finally {
    history.close()
  }
}
