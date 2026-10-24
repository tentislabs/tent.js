import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fetchPart } from '../../engine/index.ts'

/**
 * Takes a text in YAML. Answers the value it reads as, with the reader of YAML, a part that the tools fetch on its
 * first use (`yaml`, ISC). Throws T0016 where the part cannot be fetched, and the reader's error for a text that
 * does not read.
 */
export async function readYaml(text: string): Promise<unknown> {
  const part = await fetchPart('yaml')
  // The package names this file as its entry for the runtime, in its `exports` and in its `main`.
  const loaded: unknown = await import(pathToFileURL(join(part, 'node_modules', 'yaml', 'dist', 'index.js')).href)
  const parse: unknown =
    Reflect.get(Object(loaded), 'parse') ?? Reflect.get(Object(Reflect.get(Object(loaded), 'default')), 'parse')
  if (typeof parse !== 'function') throw new Error('The part yaml gives no reader.')
  return Reflect.apply(parse, undefined, [text])
}
