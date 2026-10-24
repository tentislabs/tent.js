import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { TentError } from '../core/index.ts'
import type { Description, Facts } from '../core/internal.ts'
import type { Files, Store } from '../data/index.ts'
import { factsOf, openFiles, sqliteStore } from '../data/index.ts'
import { advisedIn } from './advised.ts'
import { waitingNames, waitingNamesInFiles } from './flows/facts.ts'
import type { MakerInput, Makers } from './makers.ts'
import { withRunTables } from './flows/fileTables.ts'
import { engineTables, layoutFor } from './tableChanges.ts'

/** Whether a value has the parts of a description that a table change is read from. */
export const isDescription = (value: unknown): value is Description =>
  typeof value === 'object' &&
  value !== null &&
  typeof Reflect.get(value, 'tables') === 'object' &&
  Reflect.get(value, 'tables') !== null &&
  typeof Reflect.get(value, 'project') === 'object' &&
  Reflect.get(value, 'project') !== null

/**
 * Takes a store that stands open, and a description. Answers the facts that the check needs of that data: what
 * the table change from the data to the description would be refused for (T2001 to T2004), as the data part finds
 * it, and the step names that the unfinished runs of its flows depend on. It changes nothing.
 */
export function factsIn(store: Store, description: Description): Facts {
  return { tableFindings: factsOf(store, description).tableFindings, waitingStepNames: waitingNames(store) }
}

/**
 * Takes the files of an app that keeps a data file for each tenant, and a description. Answers a promise of the
 * facts that the check needs of that data: the shared file and the file of each tenant are held against the
 * description, to read alone, and a row of a tenant that does not fit names its tenant and its count.
 */
export async function factsInFiles(files: Files, description: Description): Promise<Facts> {
  const { tableFindings } = await factsOf(files, description)
  return { tableFindings, waitingStepNames: await waitingNamesInFiles(files) }
}

/** A store that ships, opened to read alone whatever it is opened with. */
function readingStore(): Store {
  const store = sqliteStore()
  return { ...store, open: (where, how) => store.open(where, { ...how, readOnly: true }) }
}

/** The facts of a data folder that keeps a data file for each tenant, with no engine: every file is opened to read alone, and closed again. */
async function factsOfFolder(folder: string, description: Description): Promise<Facts> {
  const tables = await withRunTables(description, await engineTables())
  const files = openFiles(folder, layoutFor(description, tables), { store: readingStore })
  try {
    return await factsInFiles(files, description)
  } finally {
    for (const file of files.open()) files.close(file)
    files.shared.close()
  }
}

/**
 * Takes a data folder, a description, and with them the makers of a program. Answers the facts of the check for
 * an app that no engine runs: it opens the data to read alone for the length of the call, with the `store` of the
 * makers where there is one, and closes it again. A folder that holds no data says nothing, and nothing is made
 * in it. For data that keeps a data file for each tenant it answers a promise, and reads the file of each tenant
 * too. Throws T0013 for what is no description, and T0018 for data that cannot be opened.
 */
export function readFacts(
  dataFolder: string,
  description: Description,
  o: { makers?: Makers } = {},
): Facts | Promise<Facts> {
  if (!isDescription(description))
    throw new TentError('T0013', '`readFacts` takes the description of a project.', {
      fix: 'Hand it the description that `describeProject` of `tentjs/build` answers.',
    })
  const folder = resolve(dataFolder)
  const maker = o.makers?.store
  // The index advice that the log of the folder holds stands with what the data says.
  const withAdvice = (facts: Facts): Facts => ({
    ...facts,
    tableFindings: [...facts.tableFindings, ...advisedIn(folder, description)],
  })
  // The store that ships keeps its data in one file: where that is not there, no app was ever opened on the folder.
  if (!maker && !existsSync(join(folder, 'data.db'))) return withAdvice({ tableFindings: [], waitingStepNames: {} })
  const input: MakerInput = {
    dataFolder: folder,
    secrets: {},
    settings: {},
    mcp: { request: () => Promise.reject(new TentError('T0013', 'No client of MCP is joined to a reading of facts.')) },
  }
  const store = maker ? maker(input) : sqliteStore()
  // What lies there and does not open as data is told by its place, and not by what the store said last.
  const unopened = (error: unknown): never => {
    if (error instanceof TentError && error.code !== 'T0009') throw error
    const file = join(folder, 'data.db')
    throw new TentError(
      'T0018',
      `The data cannot be opened: ${file} is no database that an engine made (${error instanceof Error ? error.message : String(error)}).`,
      {
        fix: 'Name the data folder of the app with `--data`. Where it is that folder, move the file away and put a backup back with `tent data restore`.',
      },
    )
  }
  try {
    store.open(folder, { readOnly: true })
    // The directory of the files of tenants stands in the shared file of an app that keeps some, and the files of
    // tenants that do not open are told as the shared file is.
    if (!maker && store.layout().some((table) => table.name === '_t_tenants')) {
      store.close()
      return factsOfFolder(folder, description).then(withAdvice, unopened)
    }
    return withAdvice(factsIn(store, description))
  } catch (error) {
    return unopened(error)
  } finally {
    try {
      store.close()
    } catch {
      // A store that never opened has nothing to close.
    }
  }
}
