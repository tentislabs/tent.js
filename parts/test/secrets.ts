import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Description } from '../core/internal.ts'
import { makeSecretKey, storedValues } from '../engine/index.ts'

/**
 * Takes the data folder of a test app, its description, and the values that the test gives. Sets the secrets of
 * test data before the app opens: each that the test gives, and for every other secret that a definition names the
 * text `test-<NAME>`. So a definition that needs a secret works in a test, and reaches nothing with a real key.
 */
export function testSecrets(dataFolder: string, description: Description, given: Record<string, string>): void {
  makeSecretKey(dataFolder)
  const listed: unknown = storedValues(dataFolder, description, { kind: 'secrets', list: true })
  const named: unknown = Reflect.get(Object(listed), 'missing')
  const values: Record<string, string> = {}
  for (const name of Array.isArray(named) ? named : []) values[String(name)] = `test-${String(name)}`
  for (const [name, value] of Object.entries({ ...values, ...given }))
    storedValues(dataFolder, description, { kind: 'secrets', name, value })
}

/**
 * Takes the data folder of a test app. Where `tent test --ai` runs it, the key and the file of the secrets of the
 * project's own test data are laid into it first: so a test of AI behaviour reaches the providers with the keys
 * that the builder set. A test that the command does not run is left as it was.
 */
export function keysOfProject(dataFolder: string): void {
  const from = process.env.TENT_AI_DATA
  if (!from) return
  mkdirSync(dataFolder, { recursive: true })
  for (const file of ['secret.key', 'secrets.test'])
    if (existsSync(join(from, file))) copyFileSync(join(from, file), join(dataFolder, file))
}
