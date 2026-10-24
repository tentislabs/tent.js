import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * What a release of ours wrote beside the player it holds: its version, and the one address where releases are
 * served, which ships in the install. `player` is the folder of the player, and `tools` that of the build tools,
 * where the install holds them.
 */
export interface Shipped {
  version: string
  releases?: string
  player: string
  tools?: string
}

/**
 * Answers what the release this program runs from shipped with, read from `shipped.json` of its player, or nothing
 * where the framework runs from its own sources, as in its repository.
 */
export function shippedRelease(): Shipped | undefined {
  // The engine lies in the player as `parts/engine/`, so the player is two folders above it.
  const player = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
  const file = join(player, 'shipped.json')
  if (!existsSync(file)) return undefined
  // A file that does not read is passed over, as `trust.json` is: the install then runs as one with none.
  let read: unknown
  try {
    read = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return undefined
  }
  const version: unknown = Reflect.get(Object(read), 'version')
  const releases: unknown = Reflect.get(Object(read), 'releases')
  if (Reflect.get(Object(read), 'format') !== 'tent.shipped/1' || typeof version !== 'string') return undefined
  const tools = join(dirname(player), 'tools')
  return {
    version,
    player,
    ...(typeof releases === 'string' && releases !== '' ? { releases } : {}),
    ...(existsSync(join(tools, 'parts')) ? { tools } : {}),
  }
}

/**
 * Where releases are served for this install: what `TENT_RELEASES` names, which a person typed and so counts as
 * listed for the fetch, or else the one address that ships in the install. Nothing where neither is there.
 */
export function releasesOf(): { from: string; typed: boolean } | undefined {
  const typed = process.env.TENT_RELEASES
  if (typed) return { from: typed.endsWith('/') ? typed : `${typed}/`, typed: true }
  const shipped = shippedRelease()?.releases
  return shipped ? { from: shipped.endsWith('/') ? shipped : `${shipped}/`, typed: false } : undefined
}

/** The keys a release may be signed with: those of `trust.json` of the install, or else those its player shipped with. */
export function trustedKeys(home: string): string[] {
  const player = shippedRelease()?.player
  for (const file of [join(home, 'trust.json'), ...(player ? [join(player, 'trust.json')] : [])]) {
    if (!existsSync(file)) continue
    try {
      const keys: unknown = Reflect.get(Object(JSON.parse(readFileSync(file, 'utf8'))), 'keys')
      if (Array.isArray(keys) && keys.every((one) => typeof one === 'string')) return keys
    } catch {
      // A file that cannot be read trusts nothing: the next one is asked.
    }
  }
  return []
}
