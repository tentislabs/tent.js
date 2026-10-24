import { existsSync, mkdirSync } from 'node:fs'
import { TentError } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import type { ValuesMode, ValueKind } from './files.ts'
import { valuesFile } from './files.ts'
import { secretKeyAt, keyFile, keyIsGiven, keyText, newKey, writeSecretKey } from './key.ts'
import type { SecretValues } from './secrets.ts'
import { secretValues } from './secrets.ts'
import type { SettingValues } from './settings.ts'
import { settingValues } from './settings.ts'

/** What is asked of the secrets or the settings of a data folder: one is set, one is removed, or they are listed. */
export interface ValuesAsked {
  kind: ValueKind
  // The live file, where the test file is not meant.
  live?: boolean
  name?: string
  value?: unknown
  remove?: boolean
  list?: boolean
  // The value is the text of a command: of a setting that is no text it is read as JSON.
  written?: boolean
}

/** The names of the secrets that the definitions of a description name. */
export function secretsNamed(description: Description): string[] {
  const found = new Set<string>()
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) for (const one of node) walk(one)
    else if (typeof node === 'object' && node !== null) {
      const keys = Object.keys(node)
      const name: unknown = Reflect.get(node, 'secret')
      if (keys.length === 1 && typeof name === 'string') found.add(name)
      else for (const one of Object.values(node)) walk(one)
    }
  }
  walk(description)
  return [...found].sort()
}

/**
 * Takes a data folder. Makes its key file, `secret.key`, with a new key, by the one rule of who makes one: only
 * where no key is given by `TENT_SECRET_KEY`, the folder holds no key file, and no secrets file is there yet.
 * Answers whether it made one. So no key is ever made beside a secrets file that another key wrote.
 */
export function makeSecretKey(dataFolder: string): boolean {
  if (keyIsGiven() || secretKeyAt(dataFolder) !== undefined) return false
  if (existsSync(keyFile(dataFolder))) return false
  for (const held of ['test', 'live'] as const) if (existsSync(valuesFile(dataFolder, 'secrets', held))) return false
  mkdirSync(dataFolder, { recursive: true })
  writeSecretKey(keyFile(dataFolder), newKey())
  return true
}

/** A new key of the secrets, as it is written wherever it stands: it is kept nowhere. */
export const newSecretKey = (): string => keyText(newKey())

/**
 * Takes what was asked, the secrets and the settings it is asked of, and the description. Carries it out, and
 * answers what a command prints: for a list of secrets the names that are set and those that a definition names
 * and that are not, and never a value; for a list of settings each with its value; for a set or a removal the
 * name, and of a setting its value. Throws T0002 for an asking that names nothing, T0019 where a secret is
 * set with no key at hand or under a key that does not open the file, and T0002 for a setting that the project
 * does not state or a value that does not fit its type.
 */
export function carriedOut(
  asked: ValuesAsked,
  at: { secrets: SecretValues; settings: SettingValues; description: Description },
): unknown {
  const name = asked.name
  if (asked.list === true) {
    if (asked.kind === 'settings') return { settings: at.settings.list() }
    const set = at.secrets.names()
    return { set, missing: secretsNamed(at.description).filter((one) => !set.includes(one)) }
  }
  if (typeof name !== 'string' || name === '')
    throw new TentError('T0002', `A ${asked.kind === 'secrets' ? 'secret' : 'setting'} is named.`, {
      fields: { name: 'required' },
    })
  if (asked.kind === 'secrets') {
    if (asked.remove === true) at.secrets.remove(name)
    else {
      if (typeof asked.value !== 'string' || asked.value === '')
        throw new TentError('T0002', `The secret ${name} is set to a value: a text that holds something.`, {
          fields: { value: 'required' },
        })
      at.secrets.set(name, asked.value)
    }
    return { name, set: asked.remove !== true }
  }
  if (asked.remove === true) {
    at.settings.remove(name)
    return { name, set: false, ...valueOf(at.settings, name) }
  }
  if (asked.value === undefined)
    throw new TentError('T0002', `The setting ${name} is set to a value.`, { fields: { value: 'required' } })
  at.settings.set(name, asked.value, asked.written === true)
  return { name, set: true, ...valueOf(at.settings, name) }
}

/** The value that a setting has now, as a record that holds it where it has one. */
function valueOf(settings: SettingValues, name: string): { value?: unknown } {
  const shown = settings.list().find((one) => one.name === name)
  return shown?.value === undefined ? {} : { value: shown.value }
}

/**
 * Takes a data folder, the description of the project, and what is asked of its secrets or its settings. Carries
 * it out on the files of the folder, with no engine: it is what a command does when none runs. Answers what the
 * command prints.
 */
export function storedValues(dataFolder: string, description: Description, asked: ValuesAsked): unknown {
  const held: ValuesMode = asked.live === true ? 'live' : 'test'
  return carriedOut(asked, {
    secrets: secretValues(dataFolder, held),
    settings: settingValues(dataFolder, held, () => description),
    description,
  })
}
