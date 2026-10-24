import { existsSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { TentError } from '../../core/index.ts'
import type { Files, Store, TableLayout } from '../../data/index.ts'
import { connected, here, keepChanges, sqliteStore } from '../../data/index.ts'
import { runningElsewhere } from '../engineFile.ts'
import { heldHere } from '../open.ts'
import type { ValuesMode } from './files.ts'
import { readValues, valuesFile, writeValues } from './files.ts'
import { secretKeyAt, keyFile, secretKeyIn, keyIsGiven, keyText, newKey, noKeyAtHand, writeSecretKey } from './key.ts'
import { forgetSeal } from './seal.ts'
import { sealedIn } from './sealedValues.ts'
import { openText, sealText } from './sealing.ts'
import { secretBound } from './secrets.ts'
import { tenantFilesOpened, tenantsAgain, tenantsBehind } from './tenantsAgain.ts'

const system = { kind: 'system' } as const
const both: ValuesMode[] = ['test', 'live']

/** What the replacing of the key of a data folder did. */
export interface KeyReplaced {
  // What the folder is among the machines of its app: a writer seals its data again, and a reader seals none.
  role: 'writer' | 'reader'
  // How many sealed values of rows, and of kept versions of rows, were sealed again under the new key.
  sealed: number
  // How many secrets were written again under the new key.
  secrets: number
  // Where the key is given by `TENT_SECRET_KEY`: the new key, which whoever runs the engine gives it from now on.
  key?: string
}

/**
 * Opens the data of a folder as a writer opens it, with the number of each write kept, and its changes where they
 * are kept: of an app that keeps a file for each tenant, its files, whose shared file is `store`.
 */
function opened(dataFolder: string): { store?: Store; files?: Files; layout: TableLayout[] } {
  // A folder that no engine has opened yet holds no data: there is nothing in it to seal again.
  if (!existsSync(join(dataFolder, 'data.db'))) return { layout: [] }
  const plain = sqliteStore()
  plain.open(dataFolder)
  const layout = plain.layout()
  const has = (name: string): boolean => layout.some((table) => table.name === name)
  const kept = has('_t_here') && here(plain).kept === true
  plain.close()
  if (!has('_t_here')) return { layout: [] }
  if (has('_t_tenants')) {
    const files = tenantFilesOpened(dataFolder, layout, kept)
    return { store: files.shared, files, layout }
  }
  const store = connected(sqliteStore(), layout, {})
  store.open(dataFolder)
  return { store, layout }
}

/**
 * Writes the secrets of one file again under another key, beside the old file. Answers how many it wrote, and
 * what puts the new file in the place of the old one. A value that opens under neither key stops it with T0019.
 */
function secretsAgain(
  dataFolder: string,
  held: ValuesMode,
  keys: { old: Uint8Array; next: Uint8Array },
): { count: number; place(): void } {
  const file = valuesFile(dataFolder, 'secrets', held)
  if (!existsSync(file)) return { count: 0, place: () => undefined }
  const again: Record<string, string> = {}
  for (const [name, sealed] of Object.entries(readValues(file, 'secrets'))) {
    const bound = secretBound(held, name)
    const text = String(sealed)
    const value = openText(keys.next, text, bound) ?? openText(keys.old, text, bound)
    if (value === undefined)
      throw new TentError(
        'T0019',
        `The secret ${name} of ${file} opens under neither the key at hand nor the new one.`,
        {
          fix: 'Give the key that the file was written under, and run the command again.',
        },
      )
    again[name] = sealText(keys.next, value, bound)
  }
  const beside = `${file}.again`
  writeValues(beside, 'secrets', again)
  return { count: Object.keys(again).length, place: () => renameSync(beside, file) }
}

/**
 * `tent secrets key --replace`: takes a data folder whose engine is stopped, and what is asked whether a new key
 * that is printed was kept. On a writer it makes a new key, written first as `secret.key.next`, seals every
 * sealed value of the data again under it: the shared file in one write, which is made as the writer makes any
 * write, and each tenant's file that holds a sealed column in one write of that file, one after another. It writes both
 * secrets files again beside the old ones, and renames the three: the new key stands as `secret.key.next` until
 * the last value is sealed. A run that was stopped half way is finished by the next one: a value that opens under
 * the new key is left as it is. On the folder of a reader, or of a writer that was stopped, it makes no key and
 * seals no data: it is handed the new key as the file `secret.key.next` laid into the folder, and writes the
 * secrets files of that folder again under it, once no sealed value of its data opens under the old key alone.
 * Throws T0013 for a folder whose engine runs, for the folder
 * of a reader with no new key laid into it or with a value that is not handed over yet, and where the new key was
 * not kept; and T0019 with no key at hand.
 */
export async function replaceSecretKey(
  dataFolder: string,
  o: { kept?: (key: string) => boolean | Promise<boolean> } = {},
): Promise<KeyReplaced> {
  return replaced(dataFolder, o, false)
}

/**
 * Takes the data folder of an app that is being opened as a writer. Where a new key lies beside its key, as a run
 * of the command that was stopped half way left it, the run is finished before the data is opened: so no moment
 * leaves data that no key opens. Where the key is given by a variable, the data must open under that key: the
 * run is undone, every value sealed under the new key sealed again under the given one, and the new key stays
 * where it lies for the command, which takes it away: until then the engine holds both keys.
 */
export async function finishKeyReplaced(dataFolder: string): Promise<void> {
  if (!existsSync(keyFile(dataFolder, '.next')) || (!keyIsGiven() && !existsSync(keyFile(dataFolder)))) return
  try {
    await replaced(dataFolder, {}, true)
  } catch (error) {
    // What the command would refuse is left for the command: the app opens, and a value opens under either key.
    if (!(error instanceof TentError)) throw error
  }
}

async function replaced(
  dataFolder: string,
  o: { kept?: (key: string) => boolean | Promise<boolean> },
  own: boolean,
): Promise<KeyReplaced> {
  if (!own && (heldHere(dataFolder) || (await runningElsewhere(dataFolder)) !== undefined))
    throw new TentError(
      'T0013',
      'The key of the secrets is replaced with the engine stopped, and one runs on this data folder.',
      {
        fix: 'Stop the engine, run `tent secrets key --replace`, and start the engine again with the new key.',
      },
    )
  const old = secretKeyAt(dataFolder)
  if (!old) throw noKeyAtHand('Replacing the key')
  const nextFile = keyFile(dataFolder, '.next')
  const { store, files: tenantFiles, layout } = opened(dataFolder)
  try {
    const role = store ? here(store).role : undefined
    const reads = role === 'reader' || role === 'stopped'
    let next = secretKeyIn(nextFile)
    if (reads && !next)
      throw new TentError(
        'T0013',
        'This is the data folder of a reader: it is handed the new key that the run on the writer made, and none lies in it.',
        {
          fix: 'Lay the file `secret.key.next` of the writer into this folder, and run the command again.',
        },
      )
    if (!next) {
      next = newKey()
      // The new key is written before a value is sealed under it: a run that is stopped loses no key.
      writeSecretKey(nextFile, next)
      if (keyIsGiven() && (await o.kept?.(keyText(next))) !== true) {
        rmSync(nextFile, { force: true })
        throw new TentError('T0013', 'The new key was not kept, so nothing was sealed under it.', {
          fix: 'Keep the key that the command prints, answer `yes`, and give the engine that key as `TENT_SECRET_KEY` from then on.',
        })
      }
    }
    // A writer that opens with the key a variable gives undoes a run that was stopped: the data goes back to it.
    const undoing = own && keyIsGiven()
    const keys = undoing ? { old: next, next: old } : { old, next }
    let sealed = 0
    if (reads && store) {
      // A reader seals nothing: the sealed rows reach it from its writer. A value that still opens under the old
      // key alone was not handed over yet.
      let behind = 0
      sealedIn(
        (plan) => store.read(plan, system).value,
        undefined,
        layout,
        keys,
        (stillOld) => {
          behind += stillOld ? 1 : 0
        },
      )
      // The files of its tenants are held the same way, each read alone.
      behind += tenantsBehind(dataFolder, store, keys)
      if (behind)
        throw new TentError(
          'T0013',
          `${behind} sealed ${behind === 1 ? 'value' : 'values'} of this reader still ${behind === 1 ? 'opens' : 'open'} under the old key alone: its writer has not handed it every row that was sealed again.`,
          {
            fix: 'Let the reader join its writer, and run the command again. `secret.key.next` stays where it lies.',
          },
        )
    } else if (store) {
      if (!tenantFiles && here(store).kept) keepChanges(store)
      store.write((tx) =>
        sealedIn(
          (plan) => tx.read(plan, system),
          tx,
          layout,
          keys,
          (stillOld, again) => {
            if (!stillOld) return
            again()
            sealed += 1
          },
        ),
      )
      // Then each tenant's file that holds a sealed column, in one write of that file, one after another.
      if (tenantFiles) sealed += tenantsAgain(dataFolder, tenantFiles, keys)
    }
    const files = both.map((held) => secretsAgain(dataFolder, held, keys))
    for (const file of files) file.place()
    const given = keyIsGiven()
    // Where the key is a file, the new one takes its place last. Where it is a variable, the new one was printed.
    if (given && !undoing) rmSync(nextFile, { force: true })
    else if (!given) renameSync(nextFile, keyFile(dataFolder))
    return {
      role: reads ? 'reader' : 'writer',
      sealed,
      secrets: files.reduce((count, file) => count + file.count, 0),
      ...(given && !reads ? { key: keyText(next) } : {}),
    }
  } finally {
    store?.close()
    forgetSeal(dataFolder)
  }
}
