import type { Finding } from '../core/index.ts'

const isError = (one: Finding): boolean => one.level === 'error'

/**
 * Takes what the build of a save found, its version and its list, the version that runs, what holds the build
 * against our own rules, and what loads a version into the app. Where the build found no error and made another
 * version, loads it while the rules hold the build, not after them. Answers what the rules found, and the version
 * to switch to: none where the build or the rules found an error, and none where it could not be loaded, which is
 * answered as what failed. A version that was loaded and is not switched to is dropped with those nobody needs.
 */
export async function heldAndAdded(o: {
  findings: Finding[]
  versionId: string
  list: string
  running: string
  rules(): Promise<Finding[]>
  add(list: string): Promise<string>
}): Promise<{ found: Finding[]; version?: string; failed?: unknown }> {
  const loads = !o.findings.some(isError) && o.versionId !== '' && o.versionId !== o.running
  const loading: Promise<{ version: string } | { failed: unknown } | undefined> = loads
    ? o.add(o.list).then(
        (version) => ({ version }),
        (failed: unknown) => ({ failed }),
      )
    : Promise.resolve(undefined)
  const found = await o.rules()
  const loaded = await loading
  if (!loaded || found.some(isError)) return { found }
  return { found, ...loaded }
}
