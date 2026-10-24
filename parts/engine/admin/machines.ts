import type { Admin } from '../admin.ts'

/**
 * `tent machines`: every machine of the app, the writer first, each as `app.machines` gives it, with the epoch.
 * On a reader it is what the writer answers when it is asked, and what the reader last held where the writer
 * cannot be reached. `other` is the newest other writer that a writer heard of since it opened, and on a writer that
 * was stopped the one that stopped it.
 */
export const admin: Admin = {
  name: 'machines',
  async run(o) {
    const { reader } = o.machine
    const machines = reader ? await reader.ask() : o.machine.machines()
    const other = o.machine.writer?.other()
    return {
      epoch: o.machine.at().epoch,
      machines: machines.length ? machines : o.machine.machines(),
      ...(other ? { other } : {}),
    }
  },
}
