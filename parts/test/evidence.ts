import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { TentError } from '../core/index.ts'
import type { Browsed } from '../engine/index.ts'
import { testNow } from './named.ts'

/** A name of a folder that the systems all take, made from the name of a test. */
const folderName = (test: string): string =>
  test
    .replace(/[^A-Za-z0-9 _.-]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 120) || 'a-test'

/**
 * Takes the browser of a page whose step failed, what the page code tells of its calls, and the failure. Keeps, under
 * `results/tests/<test>/` of the folder the test runs in, a picture of the page, what it wrote to its console, what
 * a reader of the screen heard, and the trace of every call it made, which `tent logs --trace` opens. Answers the
 * failure, its words naming them: a `TentError` keeps its code.
 */
export async function kept(
  browsed: Browsed,
  told: { heard(): Promise<unknown>; traces(): Promise<unknown> },
  failure: unknown,
): Promise<unknown> {
  const folder = join(process.cwd(), 'results', 'tests', folderName(testNow()))
  try {
    rmSync(folder, { recursive: true, force: true })
    mkdirSync(folder, { recursive: true })
    const [picture, heard, traces] = await Promise.all([
      browsed.picture().catch(() => undefined),
      told.heard().catch(() => ''),
      told.traces().catch(() => []),
    ])
    if (picture) writeFileSync(join(folder, 'picture.png'), picture)
    writeFileSync(
      join(folder, 'console.txt'),
      browsed
        .console()
        .map((line) => `${line}\n`)
        .join(''),
    )
    writeFileSync(join(folder, 'reader.txt'), String(heard))
    const ids = Array.isArray(traces) ? traces.map(String) : []
    writeFileSync(join(folder, 'traces.txt'), ids.map((id) => `${id}  tent logs --trace ${id}\n`).join(''))
  } catch {
    // What could not be kept is not kept: the failure itself is what the test is told.
    return failure
  }
  const where = relative(process.cwd(), folder).replaceAll('\\', '/')
  const named = `What the page held is kept in ${where}/: picture.png, console.txt, reader.txt and traces.txt.`
  if (failure instanceof TentError) {
    const again = new TentError(failure.code, `${failure.message} ${named}`, {
      ...(failure.fix === undefined ? {} : { fix: failure.fix }),
      ...(failure.fields === undefined ? {} : { fields: failure.fields }),
    })
    return Object.assign(again, { kept: folder })
  }
  return failure
}
