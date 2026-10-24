// What a project that states no `zone` and no `languages` has: the stored record leaves a member out that equals it.
export const defaultZone = 'UTC'
export const defaultLanguages: readonly string[] = ['en']

/** Takes the record of a project as it is stored. Answers its zone: the one it states, or the default. */
export const projectZone = (project: unknown): string => {
  const zone: unknown = Reflect.get(Object(project), 'zone')
  return typeof zone === 'string' ? zone : defaultZone
}

/** Takes the record of a project as it is stored. Answers its languages, the default first: those it states, or the default. */
export const projectLanguages = (project: unknown): string[] => {
  const languages: unknown = Reflect.get(Object(project), 'languages')
  return Array.isArray(languages) ? languages.map(String) : [...defaultLanguages]
}
