import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { tent } from '../shell.ts'
import { bundleOf, folderOf, shopIn } from './bundledShop.ts'

// The attacks of the reviewer on the commands of the install: the launcher that a service starts, and its folder.

/** Runs a command in this program with the folder of the install that is handed, and answers its end and its print. */
async function typed(words: string[], folder: string, home: string): Promise<{ code: number; out: string }> {
  const before = process.env.TENT_HOME
  process.env.TENT_HOME = home
  const lines: string[] = []
  try {
    const code = await tent(words, { folder, out: (line) => lines.push(line) })
    return { code, out: lines.join('\n') }
  } finally {
    if (before === undefined) delete process.env.TENT_HOME
    else process.env.TENT_HOME = before
  }
}

/** Opens a path to everyone of this computer, as a careless copy leaves it. */
function openedToAll(path: string): void {
  if (process.platform === 'win32')
    spawnSync('icacls', [path, '/grant', '*S-1-1-0:M', '/q'], { stdio: 'ignore', windowsHide: true })
  else spawnSync('chmod', ['666', path])
}

test('[41-12.33] tent service with a launcher that another user can write is refused', async (t) => {
  const folder = folderOf(t, 'review-service')
  const bundle = await bundleOf(shopIn(folder))
  const home = join(folder, 'home')
  mkdirSync(join(home, 'bin'), { recursive: true })
  const launcher = join(home, 'bin', process.platform === 'win32' ? 'tentw.exe' : 'tent')
  writeFileSync(launcher, 'a launcher')
  // The folder of the install for the current user alone, as its installer makes it.
  if (process.platform === 'win32')
    spawnSync(
      'icacls',
      [home, '/inheritance:r', '/grant:r', `${process.env.USERDOMAIN}\\${process.env.USERNAME}:(OI)(CI)F`, '/t', '/q'],
      { stdio: 'ignore', windowsHide: true },
    )
  else spawnSync('chmod', ['-R', 'go-w', home])
  const kept = await typed(['service', bundle, '--data', join(folder, 'data')], folder, home)
  assert.equal(kept.code, 0, kept.out)
  openedToAll(launcher)
  const refused = await typed(['service', bundle, '--data', join(folder, 'data')], folder, home)
  assert.equal(refused.code, 1, refused.out)
  assert.match(refused.out, /launcher .* is refused: others can write/i)
})

test('[41-12.42] a project in the home folder itself, whose .tent/ would be the folder of the install, is refused', async (t) => {
  const folder = folderOf(t, 'review-home')
  const project = shopIn(folder)
  const home = join(project, '.tent')
  mkdirSync(home, { recursive: true })
  const refused = await typed(['check', '--json'], project, home)
  assert.notEqual(refused.code, 0, refused.out)
  assert.match(refused.out, /folder of the install/)
})
