import { exportUser, removeUser } from '../../../data/index.ts'
import type { Admin } from '../../admin.ts'
import { badWord, wordOf } from '../../admin.ts'
import { keepsArchive } from '../../archived/archive.ts'
import { backupsIn } from '../../backups.ts'
import { forgetFilesOf } from '../../stored/person.ts'
import { openedSteps } from '../../flows/sealedSteps.ts'
import { sealed } from '../../values/seal.ts'
import { forgetPerson } from '../../remember/kept.ts'
import { forgetKeysAndConnections } from '../../keys/forget.ts'
import { forgetGrants, grantsOf } from '../../grants/kept.ts'
import { streamsEnded } from '../../mcp/kept.ts'
import { forgetSummaries } from '../../ai/removed.ts'
import { forgetCounts } from '../../counts/removed.ts'
import { writeCounts } from '../../counts/gather.ts'

/**
 * `tent data user export <id>` and `tent data user remove <id>`. The export answers every row the person
 * owns and their row of `users`. The removal shows the count first: it answers how many rows of each table are
 * theirs, and removes them only with `yes`, in one write, with `removed` written in place of the person wherever
 * the log names them; in an app that keeps a data file for each tenant it answers once the pass that reaches
 * every file has ended. Their loose files go with them, and a file that stays names them no more. It says how many
 * backups made before still hold the person, until they age out, and whether the archive holds them, which it does
 * until what it kept of them is past, with the backups it reaches back to.
 */
export const admin: Admin = {
  name: 'data user',
  async run(o, args) {
    const act = wordOf(args, 'do', '`export` or `remove`')
    const id = wordOf(args, 'id', 'the id of a person')
    const theirs = exportUser(o.store, o.description, id, sealed(o))
    // The runs that the person started: one that ran as them is theirs with its saved steps, a sealed result
    // opened for them, and one that had full access is listed without them.
    const started = await Promise.all(
      (o.flows?.runner.find({ startedBy: { kind: 'user', id } }) ?? []).map((run) =>
        run.as === 'starter' ? openedSteps(o, run) : { ...run, steps: [] },
      ),
    )
    const runs = started.length ? { runs: started } : {}
    // The programs that the person let act for them, with nothing of their tokens.
    const given = grantsOf(o, id).map((one) => ({ id: one.id, client: one.client, name: one.name, scopes: one.scopes }))
    if (act === 'export') return { ...theirs, ...runs, ...(given.length ? { grants: given } : {}) }
    if (act !== 'remove') throw badWord('do', '`export` or `remove`')
    const counted = Object.fromEntries(Object.entries(theirs.rows).map(([table, rows]) => [table, rows.length]))
    const rows = { ...counted, ...(theirs.user ? { users: (counted.users ?? 0) + 1 } : {}) }
    const count = started.length ? { runs: started.length } : {}
    if (Reflect.get(args, 'yes') !== true) return { removed: false, rows, ...count }
    // What was counted for them and not yet written is written first, so the removal finds it.
    writeCounts(o)
    const { value } = o.store.write((tx) => {
      // The runs they started go in the write that removes their rows, with what the engine kept by run.
      o.flows?.runner.remove({ startedBy: { kind: 'user', id } }, tx)
      // What the engine counted for them is kept as `removed`, and the summaries their runs wrote go.
      forgetCounts(o, tx, id)
      forgetSummaries(
        o,
        tx,
        started.map((one) => one.id),
      )
      forgetPerson(o, tx, id)
      // The keys that were made for them, their connections to services and the grants they gave go in the same write.
      forgetKeysAndConnections(tx, id)
      forgetGrants(tx, id)
      return removeUser(tx, o.description, id)
    })
    for (const one of given) streamsEnded(o, `grant:${one.id}`)
    // In an app that keeps a data file for each tenant the pass does the rest in every file, and is waited for.
    if (o.tenantFiles) await (await import('../../files/pass.ts')).sweepAll(o, o.tenantFiles)
    o.log.forget(id)
    await forgetFilesOf(o, id)
    return {
      removed: true,
      rows,
      ...count,
      refused: value.refused,
      backups: backupsIn(o.dataFolder).length,
      archive: keepsArchive(o.description),
    }
  },
}
