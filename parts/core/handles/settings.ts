import { isDescribing } from '../describing.ts'
import type { Settings } from '../lists.ts'
import { mark } from '../mark.ts'
import { filled } from '../runtime.ts'

/** The values of the settings of the project, each under its name and of its type. */
export type SettingValues = { readonly [Name in Extract<keyof Settings, string>]: Settings[Name] }

/**
 * Answers the handle of the settings: reading a setting
 * asks the working object of the runtime for its value, and answers the record of the setting where a definition
 * is being made or no engine stands in the slot, which is worked out when the definition is carried out.
 */
function settingsHandle<Values>(): Values
function settingsHandle(): unknown {
  return new Proxy(
    {},
    {
      get(_, name) {
        if (typeof name !== 'string' || name === 'then') return undefined
        const engine = filled()
        return isDescribing() || !engine ? mark({ setting: name }) : Reflect.get(engine.handle('settings'), name)
      },
    },
  )
}

export const settings: SettingValues = settingsHandle()
