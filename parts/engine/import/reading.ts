import { TentError } from '../../core/index.ts'
import type { Opened } from '../opened.ts'
import type { ValuesReading } from './values.ts'
import { projectZone } from '../../core/internal.ts'

/**
 * Takes an app, the names a file maps, and the language of its values, where one is named. Answers how the values
 * of the file are read: in that language, or the first of the project, with the words of the app, in the zone of
 * the project. Throws T0002 for a language the runtime does not know.
 */
export function readingOf(o: Opened, map: Record<string, string>, language: string | undefined): ValuesReading {
  const { project } = o.description
  const first =
    Array.isArray(project.languages) && typeof project.languages[0] === 'string' ? project.languages[0] : 'en'
  const named = language ?? first
  if (!Intl.NumberFormat.supportedLocalesOf([named]).length)
    throw new TentError(
      'T0002',
      `\`language\` names ${JSON.stringify(named).slice(0, 40)}, which is no language the runtime knows.`,
      {
        fields: { language: 'values' },
        fix: "Name a language by its code, as 'de' or 'en-GB'.",
      },
    )
  return {
    map,
    language: named,
    messages: o.description.messages,
    zone: projectZone(project),
  }
}
