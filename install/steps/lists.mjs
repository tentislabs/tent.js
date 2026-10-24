// The named steps `trust`, `lists` and `sign`: the lists a release is served with, and their signatures with the
// release keys (`41-install.md`, sections 3 and 4).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { layersOf } from './layers.mjs'
import { keyFile, signFile } from './sign.mjs'

const json = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)

/** The release keys that the settings name, read from their files. */
export const releaseKeys = (c) => (c.settings.releaseKeys ?? []).map((file) => keyFile(file))

/**
 * The step `trust`: `trust.json`, the public keys a release may be signed with, which ships in every install. The
 * keys are those the settings list under `trust`, or else the public halves of the release keys.
 */
export function trust(c) {
  const keys = c.settings.trust ?? releaseKeys(c).map((one) => one.public)
  json(join(c.out, 'trust.json'), { format: 'tent.trust/1', made: c.made, keys })
  if (!keys.length) c.say('trust: the settings name no release key: trust.json holds none, and nothing is signed')
}

/**
 * The step `lists`: `release.json` with every layer and archive of the version, `systems.json` with the layer of
 * each system that the npm door is repaired from, and `releases.json` beside the folders of the versions, which
 * adds this version to the list it is handed or that lies there, newest first.
 */
export function lists(c) {
  const layers = layersOf(c)
  const archivesFile = join(c.work, 'archives.json')
  const archives = existsSync(archivesFile) ? JSON.parse(readFileSync(archivesFile, 'utf8')) : {}
  const line = (one) => ({ file: one.file, size: one.size, fingerprint: one.fingerprint })
  json(join(c.out, 'release.json'), {
    format: 'tent.release/1',
    version: c.version,
    day: c.day,
    fix: c.fix,
    made: c.made,
    layers: Object.fromEntries(
      Object.entries(layers).map(([system, one]) => [system, { runtime: line(one.runtime), player: line(one.player), tools: line(one.tools) }]),
    ),
    archives,
  })
  json(join(c.out, 'systems.json'), {
    format: 'tent.systems/1',
    version: c.version,
    made: c.made,
    systems: Object.fromEntries(Object.entries(layers).map(([system, one]) => [system, line(one.system)])),
  })
  const listFile = c.releases ?? join(c.top, 'releases.json')
  const before = existsSync(listFile) ? JSON.parse(readFileSync(listFile, 'utf8')) : { versions: [] }
  const versions = [{ version: c.version, day: c.day, fix: c.fix }, ...before.versions.filter((one) => one.version !== c.version)].sort(
    (a, b) => b.version.localeCompare(a.version, 'en', { numeric: true }),
  )
  json(join(c.top, 'releases.json'), { format: 'tent.releases/1', made: c.made, versions })
}

/** The step `sign`: each list of the release signed with every release key, or left unsigned where the settings name none. */
export function sign(c) {
  const keys = releaseKeys(c)
  const files = ['release.json', 'systems.json', 'trust.json'].map((one) => join(c.out, one))
  files.push(join(c.top, 'releases.json'))
  if (!keys.length) {
    c.say('sign: the settings name no release key: the lists are unsigned')
    return
  }
  for (const file of files) signFile(file, keys)
  c.say(`sign: ${files.length} lists signed with ${keys.length} release keys`)
}
