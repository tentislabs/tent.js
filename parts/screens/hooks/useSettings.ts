import type { Settings } from '../../core/index.ts'
import { useStore } from '../page/context.ts'

/** Answers the settings of the project that are marked `public`. */
export function useSettings(): { [Name in keyof Settings]?: Settings[Name] } {
  return useStore().page.settings
}
