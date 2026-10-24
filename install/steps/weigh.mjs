// The named step `weigh`: what a person downloads, for each system, held to the two bars of `budgets.json`: the
// player, and the player with the build tools. The npm door is weighed and written down, with no bar.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { layersOf } from './layers.mjs'

const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`

/** The size of a file of the release where it was made, or nothing. */
const sized = (c, file) => (existsSync(join(c.out, file)) ? statSync(join(c.out, file)).size : undefined)

/**
 * The step. A bar is held on the installer's own file where the release made one - the archives of Linux, the
 * package of macOS and the installer of Windows, which carries the build tools beside the player - and else on the
 * layers that its installer carries. Writes `weights.json`. Throws where a bar is passed: the owner is asked then.
 */
export function weigh(c) {
  const bars = JSON.parse(readFileSync(join(c.root, 'budgets.json'), 'utf8'))
  const layers = layersOf(c)
  const weights = {}
  const missed = []
  for (const system of c.systems) {
    const one = layers[system]
    const xz = (name) => sized(c, `${name}-${c.version}-${system}.tar.xz`) ?? sized(c, `${name}-${c.version}-${system}.tar.gz`)
    const player = system.startsWith('linux') && xz('tent') ? xz('tent') : one.runtime.size + one.player.size
    const installer =
      sized(c, `tent-${c.version}-${system}.msi`) ?? sized(c, `tent-${c.version}-${system}.pkg`) ?? undefined
    const tools = system.startsWith('linux') && xz('tent-tools') ? player + xz('tent-tools') : (installer ?? player + one.tools.size)
    weights[system] = { player, tools, npm: one.system.size }
    if (player > bars['download.player'].bar) missed.push(`the player of ${system} is ${mb(player)}`)
    if (tools > bars['download.tools'].bar) missed.push(`the player with the build tools of ${system} is ${mb(tools)}`)
    c.say(`weigh: ${system}: the player ${mb(player)}, with the build tools ${mb(tools)}; the package of the system for npm ${mb(one.system.size)}`)
  }
  writeFileSync(join(c.work, 'weights.json'), `${JSON.stringify(weights, null, 2)}\n`)
  if (missed.length)
    throw new Error(`A bar of 00-how-we-build.md, section 6, is passed: ${missed.join('; ')}. The owner is asked before the release goes on.`)
}
