import { TentError } from '../core/index.ts'
import { finding } from '../core/internal.ts'
import { asked as askedOfServer } from '../publish/index.ts'
import type { Asked } from './reach.ts'
import { asked } from './reach.ts'
import { serverFetch, targetOf } from './targets.ts'

/**
 * Takes the folder of a project with the words of `--data`, `--at` and `--insecure`, the name of a command of the
 * admin channel and its words. With `--at`, has the app on that server carry it out, through its admin channel,
 * with the key of the right `operate` that `tent login` kept for that name or address; else the engine of this
 * computer, as every command of the channel. Answers what it answered, or what it was refused with, as a finding.
 */
export async function operatedAt(
  o: { folder: string; data?: unknown; at?: unknown; insecure?: unknown },
  command: 'runs' | 'logs',
  args: object,
): Promise<Asked> {
  if (typeof o.at !== 'string') return asked({ folder: o.folder, data: o.data }, command, args)
  try {
    const to = targetOf(o.at)
    return { value: await askedOfServer({ to, fetch: serverFetch(o.insecure) }, `/_t/admin/${command}`, { args }) }
  } catch (error) {
    if (!(error instanceof TentError)) throw error
    return { findings: [finding(error.code, error.message, error.fix === undefined ? {} : { fix: error.fix })] }
  }
}
