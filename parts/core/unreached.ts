/**
 * Takes the `path` of a screen or a route and the languages of the project. Answers why no request can reach it:
 * it does not start with `/`, it lies under `/_t/`, where the addresses of the engine lie, or its first part is
 * the code of a language of the project. Nothing where a request can.
 */
export function unreachedWhy(path: string, languages: readonly unknown[]): string | undefined {
  const first = path.split('/')[1] ?? ''
  if (!path.startsWith('/')) return 'does not start with `/`'
  if (first === '_t') return 'starts with `/_t/`, where the addresses of the engine lie, so it could never be reached'
  if (languages.includes(first))
    return 'starts with the code of a language of the project, so it could never be reached'
  return undefined
}
