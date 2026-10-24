import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { FileName, Files, Store, TableLayout } from '../../data/index.ts'
import { connected, metaTable, openFiles, sqliteStore } from '../../data/index.ts'
import { markedNext, rowsIn } from '../files/directory.ts'
import { numberOf } from '../held.ts'
import type { ReplacingKeys } from './sealedValues.ts'
import { sealedIn, sealedOf } from './sealedValues.ts'

const system = { kind: 'system' } as const

/** One data file of a tenant as it lies on the disk: whose it is, and where. */
interface Lying {
  file: FileName
  path: string
}

/** A value that the shared file keeps of itself in `_t_meta`. */
const metaIn = (shared: Store, id: string): unknown =>
  Reflect.get(Object(shared.read({ from: metaTable.name, one: 'get', id }, system).value), 'value')

/**
 * Every data file of a tenant that lies under `tenants/`: each folder there is a table of tenants, under the name
 * that the shared file keeps for it where it was renamed, and each file in it is named by the id of its tenant.
 */
function lyingIn(dataFolder: string, shared: Store): Lying[] {
  const root = join(dataFolder, 'tenants')
  if (!existsSync(root)) return []
  const kept = metaIn(shared, 'tenantFolders')
  const tableOf = new Map(Object.entries(Object(kept)).map(([table, folder]) => [String(folder), table]))
  const found: Lying[] = []
  for (const folder of readdirSync(root, { withFileTypes: true }))
    if (folder.isDirectory() && !folder.name.startsWith('.'))
      for (const two of readdirSync(join(root, folder.name), { withFileTypes: true }))
        if (two.isDirectory())
          for (const name of readdirSync(join(root, folder.name, two.name)))
            if (name.endsWith('.db'))
              found.push({
                file: { table: tableOf.get(folder.name) ?? folder.name, id: name.slice(0, -'.db'.length) },
                path: join(root, folder.name, two.name, name),
              })
  return found
}

/** What a data file of a tenant says of itself: whether a table of it holds a sealed column, and its last write. */
function heldIn(path: string): { sealed: boolean; n: number } {
  const plain = sqliteStore()
  plain.open(path, { readOnly: true, lazy: true })
  try {
    const sealed = plain.layout().some((table) => !table.name.startsWith('_t_') && sealedOf(table).length > 0)
    return { sealed, n: numberOf(plain) }
  } finally {
    plain.close()
  }
}

/**
 * Takes the data folder of a writer whose engine is stopped, the layout of its shared file, and whether its
 * changes are kept. Opens its files as the writer opens them: one count of writes for every file, which starts
 * above the last write that any file of a tenant holds, and with `keep` the change of each write kept in the shared
 * file, so a reader is handed it when it joins again.
 */
export function tenantFilesOpened(dataFolder: string, layout: TableLayout[], keep: boolean): Files {
  const plain = sqliteStore()
  plain.open(dataFolder, { readOnly: true })
  const tenanted: unknown = metaIn(plain, 'tenantLayout')
  const lying = lyingIn(dataFolder, plain)
  const written = rowsIn(plain).map((row) => row.writes)
  plain.close()
  const all = [...layout, ...(Array.isArray(tenanted) ? tenanted : [])]
  const above = Math.max(0, ...written, ...lying.map((one) => heldIn(one.path).n))
  return connected(openFiles(dataFolder, all, { store: () => sqliteStore() }), all, { above, keep })
}

/**
 * Takes the data folder of a writer whose engine is stopped, its files opened by `tenantFilesOpened`, and the two keys
 * of a replacing. Seals again every value of each tenant's file that holds a sealed column, each file in one write
 * of its own, one file open at a time, as the writer makes any write: it takes a number, and where the changes are
 * kept its change holds every row it sealed. Before the first of them it marks every file it will seal as `open`
 * in the directory, 64 marks to a write of the shared file, so that the engine that opens next reads the last write
 * of each and writes its row. A value that opens under the new key is left as it is, so a run that was stopped
 * between two files is finished by the next. Answers how many values it sealed again.
 */
export function tenantsAgain(dataFolder: string, files: Files, keys: ReplacingKeys): number {
  const sealing = lyingIn(dataFolder, files.shared).filter((one) => heldIn(one.path).sealed)
  if (!sealing.length) return 0
  for (let next = sealing.map((one) => one.file); next.length; )
    next = next.slice(markedNext((work) => void files.shared.write(work), next).length)
  let sealed = 0
  for (const { file } of sealing) {
    try {
      const own = files.of(file)?.layout() ?? []
      files.write((w) => {
        const tx = w.tx(file)
        sealedIn(
          (plan) => tx.read(plan, system),
          tx,
          own,
          keys,
          (stillOld, again) => {
            if (!stillOld) return
            again()
            sealed += 1
          },
        )
      })
    } finally {
      files.close(file)
    }
  }
  return sealed
}

/**
 * Takes the data folder of a reader, its shared file, and the two keys of a replacing. Answers how many values of
 * the files of its tenants still open under the old key alone: values that its writer sealed again and that it
 * was not handed yet. Each file is read alone, and nothing is written.
 */
export function tenantsBehind(dataFolder: string, shared: Store, keys: ReplacingKeys): number {
  let behind = 0
  for (const { path } of lyingIn(dataFolder, shared).filter((one) => heldIn(one.path).sealed)) {
    const store = sqliteStore()
    store.open(path, { readOnly: true, lazy: true })
    try {
      sealedIn(
        (plan) => store.read(plan, system).value,
        undefined,
        store.layout(),
        keys,
        (stillOld) => {
          behind += stillOld ? 1 : 0
        },
      )
    } finally {
      store.close()
    }
  }
  return behind
}
