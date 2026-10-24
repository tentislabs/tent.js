import { callerText } from '../../data/index.ts'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import type { Runner } from '../../flows/index.ts'
import type { CallContext } from '../context.ts'
import { byOfCaller } from '../flows/words.ts'
import type { Opened } from '../opened.ts'
import { fileRow, putFile, streamOf, wholeBytes } from '../stored/files.ts'
import { readingOf } from './reading.ts'
import { fileFormOf, recordsOf } from './records.ts'
import { importPrint, importRecords } from './run.ts'
import { isStored } from '../../core/internal.ts'

/** The flow that the engine makes for the runs of `importFile`, under a name no flow of an app can have. */
const importFlow = '_t_import'

/** What a run of an import is handed: the id of the file, the change, the names it maps, its language, and whether it writes. */
export interface ImportAsked {
  file: string
  change: string
  map: Record<string, string>
  language?: string
  dry?: true
}

/** Takes what a run was handed. Answers it as an import asks it, or throws T0002 for what is none. */
function askedOf(given: unknown): ImportAsked {
  const o = isStored(given) ? given : {}
  if (typeof o.file !== 'string' || typeof o.change !== 'string')
    throw new TentError('T0002', 'A run of an import names its file and its change.', { fields: { file: 'required' } })
  const map = isStored(o.map) ? Object.fromEntries(Object.entries(o.map).map(([from, to]) => [from, String(to)])) : {}
  return {
    file: o.file,
    change: o.change,
    map,
    ...(typeof o.language === 'string' ? { language: o.language } : {}),
    ...(o.dry === true ? { dry: true as const } : {}),
  }
}

/**
 * Takes a description. Answers it with the flow of imports beside its own flows, as the runner reads it: a flow of
 * the kind `import`, which a driver runs, with the rights of its starter.
 */
export const withImportFlow = (description: Description): Description => ({
  ...description,
  flows: { ...description.flows, [importFlow]: { import: {}, about: 'An import of a file of records.' } },
})

/**
 * Takes an app, the caller of an import and what it asks. Imports the file, each record through the change, as
 * that caller. The records it refused are listed in a loose file of the caller, whose id it answers with the counts.
 * The file was held to the rule of a download of the caller when the import was asked for.
 */
export async function imported(o: Opened, caller: Caller, asked: ImportAsked): Promise<object> {
  const file = fileRow(o, asked.file)
  if (!file || file.removedAt !== undefined)
    throw new TentError('T0001', `No file has the id ${JSON.stringify(asked.file).slice(0, 60)}.`, {
      fix: 'Name the id of a file that this caller may download.',
    })
  const content = await wholeBytes(o, file)
  const reading = readingOf(o, asked.map, asked.language)
  const records = await recordsOf(content, fileFormOf(file.name, file.kind))
  const fingerprint = importPrint(content, asked.change, reading)
  const refusedAt = join(o.dataFolder, 'files', '.imports', `${fingerprint}.csv`)
  const said = await importRecords(o, {
    records,
    change: asked.change,
    caller,
    reading,
    dry: asked.dry === true,
    fingerprint,
    refusedAt,
  })
  try {
    if (!said.refused) return said
    const listed = await putFile(o, streamOf(new Uint8Array(readFileSync(refusedAt))), {
      name: `${file.name}.refused.csv`,
      kind: 'text/csv',
      by: callerText(caller),
    })
    return { ...said, refusedFile: listed.id }
  } finally {
    rmSync(refusedAt, { force: true })
  }
}

/**
 * Takes an app and its runner. Gives the runner the driver of the kind `import`: a run of it is one step, which
 * imports its file as the starter of the run, and answers what the import answers. It is tried once: an import
 * that stops goes on from its place when it is asked for again.
 */
export function driveImports(o: Opened, runner: Runner): void {
  runner.drive(
    'import',
    async ({ step, input, starter }) => step('import', () => imported(o, starter, askedOf(input))),
    { tries: 1 },
  )
}

/** Takes an app, the call that asks for an import, and what it asks. Starts the run of the import, and answers it. */
export function startImport(o: Opened, cx: CallContext, asked: ImportAsked): { run: string } {
  const runner = o.flows?.runner
  if (!runner)
    throw new TentError('T0009', 'An import was asked of an app that keeps no runs.', {
      fix: 'Build the app again: an action that names `importFile` makes its app keep runs.',
    })
  const run = runner.add({ flow: importFlow, version: cx.version, startedBy: byOfCaller(cx.caller), input: asked })
  return { run }
}
