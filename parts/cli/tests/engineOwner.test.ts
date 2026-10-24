import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import { startWords } from './startWords.ts'
import { copied, shell, typed } from './typed.ts'

test('[15-6@4] a command reads the engine.json that the current user alone holds, and on a system that gives no number of the user it takes one that another user has a right on as no engine', async (t) => {
  // The program that the test starts is ended before the folder of the test is removed.
  const programs: (() => Promise<void>)[] = []
  t.after(async () => {
    for (const end of programs) await end()
  })
  const project = copied(t, 'engine-owner')
  const built = await buildProject(project, { for: 'release' })
  const data = join(project, '..', 'data')
  const words = startWords(['start', built.bundleFolder, '--data', data, '--port', '0', '--mode', 'test'])
  const child = spawn(process.execPath, [shell, ...words], { cwd: project, stdio: ['ignore', 'ignore', 'pipe'] })
  const ended = new Promise<void>((done) => child.once('exit', () => done()))
  programs.push(async () => {
    child.kill()
    await ended
  })
  let said = ''
  child.stderr.setEncoding('utf8').on('data', (piece: string) => {
    said += piece
  })
  for (const until = performance.now() + 60_000; performance.now() < until; ) {
    if (/runs at http/.test(said) || child.exitCode !== null) break
    await new Promise((done) => setTimeout(done, 20))
  }
  assert.match(said, /shop runs at http/, said)
  const machines = () => typed(project, 'machines', '--data', data, '--json')
  // The file as the engine wrote it, for the current user alone: the command reaches the engine.
  assert.equal((await machines()).ended, 0)
  if (process.platform !== 'win32') {
    t.diagnostic('this system tells the owner of a file by a number: the rights of the file are not asked here')
    return
  }
  // Every user of the computer is given the right to read the file, as a file of another user would have it.
  execFileSync('icacls', [join(data, 'engine.json'), '/grant', '*S-1-1-0:(R)'], { stdio: 'ignore' })
  const refused = await machines()
  assert.deepEqual([refused.ended, refused.answer.findings?.[0].code], [1, 'T0013'], refused.printed)
})
