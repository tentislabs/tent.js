import assert from 'node:assert/strict'
import type { ChildProcess } from 'node:child_process'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import type { Server } from 'node:http'
import { createServer } from 'node:http'
import { userInfo } from 'node:os'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { startWords } from './startWords.ts'
import { closed, copied, typed } from './typed.ts'

// A token that stands nowhere else, so that what a program was sent is searched for it.
const token = 'the-token-of-an-engine-that-is-gone-0123456789'

/** Another program on a port of this computer: it keeps what it was sent, and answers as an engine would. */
interface Listener {
  port: number
  // Each request it was sent: its address, its headers and its body, as one text.
  sent: string[]
}

function listening(t: TestContext): Promise<Listener> {
  const sent: string[] = []
  const server: Server = createServer((request, answer) => {
    const parts: Buffer[] = []
    request.on('data', (part: Buffer) => parts.push(part))
    request.on('end', () => {
      sent.push(`${request.method} ${request.url} ${JSON.stringify(request.headers)} ${Buffer.concat(parts)}`)
      answer.writeHead(200, { 'content-type': 'application/json' })
      answer.end(JSON.stringify({ ok: true, value: { epoch: '9.attacker', machines: [], said: 'by another program' } }))
    })
  })
  t.after(() => {
    server.closeAllConnections()
    server.close()
  })
  return new Promise((done) => {
    server.listen(0, '127.0.0.1', () => {
      const at = server.address()
      done({ port: typeof at === 'object' && at ? at.port : 0, sent })
    })
  })
}

/** The number of a program that ran and has ended. */
const goneProgram = (): number => spawnSync(process.execPath, ['--version']).pid

/** A program that runs and is no engine, ended with the test, by its own number. */
function otherProgram(t: TestContext): ChildProcess {
  const other = spawn(process.execPath, ['-e', 'setTimeout(() => undefined, 120000)'], { stdio: 'ignore' })
  t.after(() => void other.kill())
  return other
}

/** The commands that reach an engine: one that starts none where none runs, and two that take their facts or their rows from one. */
const commands = [
  ['machines', '--json'],
  ['check', '--json'],
  ['logs', '--json'],
]

/** Carries each command out on a project, and fails where the other program was sent anything. */
async function sendsNothing(project: string, listener: Listener, what: string): Promise<void> {
  for (const words of commands) {
    const output = await typed(project, ...words)
    assert.deepEqual(listener.sent, [], `${what}: tent ${words[0]} sent a request to the other program`)
    assert.equal(output.printed.includes('by another program'), false, `${what}: tent ${words[0]} believed its answer`)
  }
}

const engineFile = (pid: number, port: number): string => JSON.stringify({ port, token, pid, mode: 'development' })

test('[05-3.6] an engine.json left behind by an engine that is gone, with another program on its port: the command takes it as no engine and sends the token nowhere', async (t) => {
  const project = copied(t, 'attack-left-behind')
  const listener = await listening(t)
  mkdirSync(join(project, '.tent'), { recursive: true })
  const file = join(project, '.tent', 'engine.json')
  const left: [string, string][] = [
    ['the number of a program that has ended', engineFile(goneProgram(), listener.port)],
    ['a number that is none', engineFile(-7, listener.port)],
    ['a number that is no whole number', engineFile(1.5, listener.port)],
    ['a number written as text', JSON.stringify({ port: listener.port, token, pid: String(process.pid) })],
    ['no number', JSON.stringify({ port: listener.port, token })],
    ['a list in place of the record', JSON.stringify([{ port: listener.port, token, pid: process.pid }])],
  ]
  for (const [what, text] of left) {
    writeFileSync(file, text)
    // An engine writes the file for the current user alone, and a command reads no other.
    closed(file)
    await sendsNothing(project, listener, what)
    rmSync(file, { force: true })
  }
})

test('[05-3.6] [05-3.9] an engine.json left behind by an engine that is gone, whose number another program has taken since: the command sends the token nowhere', async (t) => {
  const project = copied(t, 'attack-number-taken')
  const listener = await listening(t)
  const other = otherProgram(t)
  assert.equal(typeof other.pid, 'number')
  mkdirSync(join(project, '.tent'), { recursive: true })
  // The engine was ended from outside, so its file stayed. Its port and its number went to other programs.
  writeFileSync(join(project, '.tent', 'engine.json'), engineFile(Number(other.pid), listener.port))
  // Closed as an engine closes it: a file that another user has a right on is no engine before any proof is asked.
  closed(join(project, '.tent', 'engine.json'))
  const output = await typed(project, 'machines', '--json')
  // The other program is sent one request at the most: the one that asks it to prove itself, which holds a number
  // drawn at random, and neither the token nor a word of the command.
  assert.ok(listener.sent.length <= 1, `the other program was sent ${listener.sent.length} requests`)
  for (const one of listener.sent) {
    assert.match(one, /"number":"[0-9a-f]{64}"/, 'what it was sent holds a number drawn at random')
    assert.equal(one.includes(token), false, 'a program that is no engine was sent the token')
    assert.equal(one.includes('machines'), false, 'a program that is no engine was sent a word of the command')
  }
  // What it answered proves nothing: the command takes it as no engine.
  assert.equal(output.printed.includes('by another program'), false)
  assert.deepEqual([output.ended, output.answer.findings?.[0].code], [1, 'T0013'])
})

test('[05-3.7] a link in the place of engine.json, put there by another user, that points to a file of theirs: the command reads no file that is a link, and sends the token nowhere', async (t) => {
  const project = copied(t, 'attack-link')
  const listener = await listening(t)
  mkdirSync(join(project, '.tent'), { recursive: true })
  const file = join(project, '.tent', 'engine.json')
  // The file of the other user names this program, which runs, so that only the link tells it from an engine.
  const theirs = join(project, '..', 'theirs.json')
  writeFileSync(theirs, engineFile(process.pid, listener.port))
  const links: [string, () => void][] = [
    ['a link', () => symlinkSync(theirs, file, 'file')],
    [
      'a link to a link',
      () => {
        symlinkSync(theirs, join(project, '..', 'between.json'), 'file')
        symlinkSync(join(project, '..', 'between.json'), file, 'file')
      },
    ],
  ]
  for (const [what, link] of links) {
    try {
      link()
    } catch (error) {
      // A system that lets this user make no link has no such attack to try.
      t.diagnostic(`${what} could not be made here, so the attack was not tried: ${Reflect.get(Object(error), 'code')}`)
      return
    }
    await sendsNothing(project, listener, what)
    rmSync(file, { force: true })
  }
})

/** Who may read a file, beside its owner: on Windows each line of rights that names another, and elsewhere the bits of the group and of the others. */
function othersOn(file: string): string[] {
  if (process.platform !== 'win32') {
    const others = statSync(file).mode & 0o077
    return others ? [`mode ${others.toString(8)}`] : []
  }
  const rights = execFileSync('icacls', [file], { encoding: 'utf8' })
  const mine = `\\${userInfo().username.toLowerCase()}:`
  return rights
    .split(/\r?\n/)
    .filter((line) => /:\(/.test(line))
    .filter((line) => !line.toLowerCase().includes(mine))
}

test('[29-11.6] the key file of a reader, read by another user of that computer: it cannot be read by them', async (t) => {
  const project = copied(t, 'attack-key-file')
  const keyFile = join(project, '..', 'reader.key')
  // The key as a person wrote it into a file, with the rights that a new file has: every user of the computer reads it.
  writeFileSync(keyFile, `${'k'.repeat(48)}\n`, { mode: 0o644 })
  if (process.platform === 'win32') execFileSync('icacls', [keyFile, '/grant', '*S-1-1-0:(R)'], { stdio: 'ignore' })
  else execFileSync('chmod', ['644', keyFile])
  assert.notDeepEqual(othersOn(keyFile), [])
  // No writer answers at that address, so the reader ends by itself, once it has read its key.
  const reader = join(project, '..', 'reader')
  const words = startWords([
    'start',
    '--reads',
    'http://127.0.0.1:9',
    '--key-from',
    keyFile,
    '--data',
    reader,
    '--insecure',
  ])
  const output = await typed(project, ...words, '--json')
  // The command closes the file to the others, or takes no key that they can read and says so.
  const refused = output.ended !== 0 && /reader\.key/.test(output.printed) && /read|right|user/i.test(output.printed)
  assert.ok(
    othersOn(keyFile).length === 0 || refused,
    `the key of the reader was taken from a file that others read (${othersOn(keyFile).join(', ').trim()}), and the command said: ${output.printed.slice(0, 300)}`,
  )
})
