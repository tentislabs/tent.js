// The named step `linux`: the archives that the Linux installer fetches - the player, and apart the build tools -
// each a tar packed with xz, and with gzip for a system that has no xz, and `install.sh`, which holds the
// fingerprint of each of them.
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { printOf } from './sign.mjs'
import { tarOf } from './tar.mjs'

/** Packs bytes with the system's own xz, or answers nothing where the system has none. */
function xzOf(bytes) {
  const ran = spawnSync('xz', ['-6', '-T0', '-c'], { input: bytes, maxBuffer: 1024 * 1024 * 1024 })
  return ran.status === 0 ? ran.stdout : undefined
}

/**
 * The step. Answers, and writes into the work folder as `archives.json`, each archive by its file with its size
 * and fingerprint, which `release.json` names so that the first start of what was unpacked is held to our signature.
 */
export function linux(c) {
  const archives = {}
  const runs = (path) => path === 'runtime/bin/node' || path.endsWith('/launcher/tent') || /\/lib\/tsc$/.test(path)
  for (const system of c.systems.filter((one) => one.startsWith('linux'))) {
    const laid = join(c.work, system)
    for (const [name, folders] of [
      ['tent', ['runtime', 'player']],
      ['tent-tools', ['tools']],
    ]) {
      const bytes = tarOf(laid, folders, { time: Math.floor(c.made / 1000), runs })
      const packed = { 'tar.gz': gzipSync(bytes, { level: 9 }) }
      const xz = xzOf(bytes)
      if (xz) packed['tar.xz'] = xz
      else c.say(`linux: this computer has no xz: ${name} of ${system} is packed with gzip alone`)
      for (const [ending, made] of Object.entries(packed)) {
        const file = `${name}-${c.version}-${system}.${ending}`
        writeFileSync(join(c.out, file), made)
        archives[file] = { system, size: made.length, fingerprint: printOf(made) }
      }
    }
  }
  const prints = Object.entries(archives)
    .map(([file, one]) => `    '${file}') echo '${one.fingerprint}' ;;`)
    .join('\n')
  const script = readFileSync(join(c.root, 'install', 'linux', 'install.sh'), 'utf8')
    .replaceAll('@VERSION@', c.version)
    .replaceAll('@RELEASES@', c.from ?? '')
    .replace('@PRINTS@', prints)
  writeFileSync(join(c.out, 'install.sh'), script)
  writeFileSync(join(c.work, 'archives.json'), `${JSON.stringify(archives, null, 2)}\n`)
  c.say(`linux: install.sh, with ${Object.keys(archives).length} archives`)
}
