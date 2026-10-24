import type { Opened } from '../opened.ts'
import { valuesHeldFor } from './files.ts'
import { formsOf } from './scrub.ts'
import type { SecretValues } from './secrets.ts'
import { secretValues } from './secrets.ts'
import type { SettingValues } from './settings.ts'
import { settingValues } from './settings.ts'

/** The secrets and the settings of one app that is open, of the files that its mode reads. */
export interface AppValues {
  secrets: SecretValues
  settings: SettingValues
  /** Every form in which a value that the engine holds may be written, which no line of a log keeps. */
  forms(): string[]
  /** Is told that a secret was set or removed: what is looked for in a log is worked out anew. */
  changed(): void
}

// The values of each app, kept under its handles: every record that the engine holds of one app shares those.
const held = new WeakMap<object, AppValues>()

/** Answers the secrets and the settings of an app. They are made at the first asking, and nothing is read then. */
export function valuesOf(o: Opened): AppValues {
  const made = held.get(o.handles)
  if (made) return made
  const which = valuesHeldFor(o.mode)
  const secrets = secretValues(o.dataFolder, which)
  let forms: string[] | undefined
  const mine: AppValues = {
    secrets,
    settings: settingValues(o.dataFolder, which, () => o.description),
    forms() {
      try {
        forms ??= formsOf(secrets.known())
      } catch {
        // A file of secrets that cannot be read holds nothing to look for: the use of a secret says what is wrong.
        return []
      }
      return forms
    },
    changed() {
      forms = undefined
    },
  }
  held.set(o.handles, mine)
  return mine
}
