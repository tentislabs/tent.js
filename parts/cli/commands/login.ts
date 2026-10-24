import { keepPublishKey } from '../../connect/index.ts'
import { TentError, text } from '../../core/index.ts'
import { runnerFolder } from '../../engine/index.ts'
import { asked } from '../../publish/index.ts'
import type { Command } from '../command.ts'
import { hiddenValue } from '../hidden.ts'
import { serverFetch } from '../targets.ts'

/** `TENT_KEY` where `TENT_AT` names the server of the address, and nothing for any other server. */
function keyOfAt(address: string): string | undefined {
  const { TENT_KEY: key, TENT_AT: at } = process.env
  if (!key || !at) return undefined
  try {
    return new URL(at).origin === address ? key : undefined
  } catch {
    // A `TENT_AT` that is no address names no server.
    return undefined
  }
}

/**
 * Keeps the key of publishing to a server in `keys.json` of the runner's folder, under a name: the mode of the
 * server, which it answers, unless `--name` gives another. It asks for the key without showing it, or takes it from
 * `TENT_KEY` where `TENT_AT` names this server. The key is tried first: a key the server does not take is not kept.
 * A key of the right `operate` is tried on the run commands, which alone it reaches, and so is any key where the
 * server serves no publishing.
 */
export const command: Command = {
  name: 'login',
  args: { address: text(), name: text({ optional: true }), insecure: text({ optional: true }) },
  needs: 'nothing',
  run: async ({ args }) => {
    const address = new URL(String(args.address)).origin
    const key = keyOfAt(address) ?? (await hiddenValue(`The key of ${address}: `))
    const reaching = { to: { address, key }, fetch: serverFetch(args.insecure) }
    // A key of the right `operate` reaches the run commands and the log alone: it is tried there where the addresses
    // of publishing refuse it.
    const told = Object(
      await asked(reaching, '/_t/sync/have', { points: [], blobs: [], pointers: true }).catch(
        async (error: unknown) => {
          if (!(error instanceof TentError) || !['T9104', 'T0001'].includes(error.code)) throw error
          await asked(reaching, '/_t/admin/runs', { args: { what: 'list' } }).catch(() => Promise.reject(error))
          return { mode: 'live' }
        },
      ),
    )
    const name = typeof args.name === 'string' ? args.name : String(told.mode ?? 'live')
    keepPublishKey(runnerFolder(), address, key, name)
    return { value: { server: address, name, mode: told.mode ?? null } }
  },
}
