import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { definitionOf } from '../service/definitions.ts'
import { runsAsRoot } from '../serving/asRoot.ts'
import { tent } from '../shell.ts'
import { outsideFolderOf, laidInstall, ran, released } from './released.ts'
import { builtShop, workOf } from './secured.ts'

// The owner's clean machines, where a definition is installed into the system and the app starts with it.
const clean = process.env.TENT_CLEAN_MACHINE === 'yes'
const onClean = { todo: clean ? false : "the owner's clean machines of the three systems: it installs into the system" }

// The folder of the programs of Windows, where the system's own programs are found and no other of their name.
const system32 = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32')

// Whether this program runs as root, or on Windows with an administrator's rights: its rights are of a high level or
// the system's, named by the id of the level in every language.
const asRoot =
  process.platform === 'win32'
    ? /"S-1-16-(12288|16384|20480|28672)"/.test(
        execFileSync(join(system32, 'whoami.exe'), ['/groups', '/fo', 'csv', '/nh'], {
          encoding: 'utf8',
          windowsHide: true,
        }),
      )
    : process.getuid?.() === 0
const onRoot = { todo: asRoot ? false : 'a machine where the tests run as root or as an administrator' }

/**
 * The words of the arguments of a task, read back as a program of Windows reads its command line: a quote opens and
 * closes a word, and the backslashes before a quote are halved, an odd one escaping the quote.
 */
function wordsOf(task: string): string[] {
  const written = /<Arguments>([^<]*)<\/Arguments>/.exec(task)?.[1] ?? ''
  const line = written
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')
  const words: string[] = []
  let word = ''
  let quoted = false
  let any = false
  for (let k = 0; k < line.length; k++) {
    const sign = line[k]
    if (sign === '\\') {
      let slashes = 0
      while (line[k] === '\\') {
        slashes++
        k++
      }
      if (line[k] === '"') {
        word += '\\'.repeat(Math.floor(slashes / 2))
        if (slashes % 2) word += '"'
        else {
          quoted = !quoted
          any = true
        }
      } else {
        word += '\\'.repeat(slashes)
        k--
      }
    } else if (sign === '"') {
      quoted = !quoted
      any = true
    } else if (/\s/.test(sign ?? '') && !quoted) {
      if (word || any) words.push(word)
      word = ''
      any = false
    } else word += sign
  }
  if (word || any) words.push(word)
  return words
}

/** Runs a command in this program, and answers what it printed and the number it ended with. */
async function typed(words: string[], folder: string): Promise<{ code: number; out: string }> {
  const lines: string[] = []
  const code = await tent(words, { folder, out: (line) => lines.push(line) })
  return { code, out: lines.join('\n') }
}

/** Whether this system takes a definition, by its own checker: the answer, or nothing where it has none here. */
function takenBySystem(text: string, folder: string): { taken: boolean; said: string } | undefined {
  if (process.platform === 'win32') {
    // The task scheduler checks the definition and registers nothing: the flag that only validates.
    const file = join(folder, 'task.xml')
    writeFileSync(file, text)
    const line = `$s = New-Object -ComObject Schedule.Service; $s.Connect(); $null = $s.GetFolder('\\').RegisterTask('tent-check', [IO.File]::ReadAllText('${file.replaceAll("'", "''")}'), 1, $null, $null, 3); 'taken'`
    const done = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', line], {
      encoding: 'utf8',
      windowsHide: true,
    })
    return { taken: done.stdout.includes('taken'), said: `${done.stdout}${done.stderr}` }
  }
  if (process.platform === 'darwin') {
    const file = join(folder, 'com.tentjs.check.plist')
    writeFileSync(file, text)
    const done = spawnSync('plutil', ['-lint', file], { encoding: 'utf8' })
    return { taken: done.status === 0, said: `${done.stdout}${done.stderr}` }
  }
  const verify = spawnSync('systemd-analyze', ['--version'], { encoding: 'utf8' })
  if (verify.status !== 0) return undefined
  const file = join(folder, 'tent-check.service')
  writeFileSync(file, text)
  const done = spawnSync('systemd-analyze', ['verify', file], { encoding: 'utf8' })
  // A launcher that is not there yet is no fault of the form.
  const said = `${done.stdout}${done.stderr}`
    .split('\n')
    .filter((line) => line.trim() && !/is not executable|No such file|Command .* is not executable/.test(line))
  return { taken: said.length === 0, said: said.join('\n') }
}

test('[41-13a] tent service prints, for the system it runs on, a definition with the words of tent start, which the system takes', async (t) => {
  const folder = workOf(t, 'service')
  const { project, bundle } = await builtShop(folder)
  const data = join(folder, 'data')
  const printed = await typed(['service', bundle, '--data', data, '--domain', 'shop.test'], project)
  assert.equal(printed.code, 0, printed.out)
  for (const word of ['start', bundle, '--data', data, '--domain', 'shop.test'])
    assert.ok(printed.out.includes(process.platform === 'win32' ? word.replaceAll('&', '&amp;') : word), word)
  assert.ok(printed.out.includes(process.platform === 'darwin' ? 'com.tentjs.shop' : 'shop (Tent.js)'), printed.out)
  const taken = takenBySystem(printed.out, folder)
  if (!taken) t.todo('this Linux has no systemd-analyze to check the unit with')
  else assert.ok(taken.taken, taken.said)
  // --line prints the one line alone, for a builder's own wrapper.
  const line = await typed(['service', bundle, '--data', data, '--line'], project)
  assert.equal(line.code, 0, line.out)
  assert.equal(line.out.trim().split('\n').length, 1)
  assert.match(line.out, /start/)
  assert.ok(line.out.includes(data))
})

test('[41-13a] a definition starts the app in the folder tent service was typed in, and under the npm door by the Node.js and the script that started tent', async (t) => {
  const o = { name: 'shop', user: 'ada', home: '/home/ada/.tent', words: ['start', '/srv/shop'], machine: false }
  const npmDoor = { ...o, launcher: ['/usr/bin/node', '/home/ada/.npm-global/lib/node_modules/tentjs/bin/tent.js'] }
  const unit = definitionOf('linux', { ...npmDoor, folder: '/home/ada/site' }).split('\n')
  assert.ok(unit.includes('WorkingDirectory=/home/ada/site'), unit.join('\n'))
  assert.ok(
    unit.includes(
      'ExecStart="/usr/bin/node" "/home/ada/.npm-global/lib/node_modules/tentjs/bin/tent.js" "start" "/srv/shop"',
    ),
    unit.join('\n'),
  )
  const person = definitionOf('darwin', { ...npmDoor, folder: '/Users/ada/site' })
  assert.match(person, /<array>\s*<string>\/usr\/bin\/node<\/string>\s*<string>[^<]*tent\.js<\/string>\s*<string>start/)
  assert.match(person, /<key>WorkingDirectory<\/key>\s*<string>\/Users\/ada\/site<\/string>/)
  const task = definitionOf('win32', {
    ...o,
    launcher: ['C:\\nodejs\\node.exe', 'C:\\npm\\node_modules\\tentjs\\bin\\tent.js'],
    folder: 'C:\\site',
  })
  assert.match(task, /<Command>C:\\nodejs\\node\.exe<\/Command>/)
  assert.match(task, /<Arguments>C:\\npm\\node_modules\\tentjs\\bin\\tent\.js start \/srv\/shop<\/Arguments>/)
  assert.match(task, /<WorkingDirectory>C:\\site<\/WorkingDirectory>/)
  // The direct door's launcher stands where no other was handed, and so does no folder.
  assert.ok(definitionOf('linux', o).includes('ExecStart="/home/ada/.tent/bin/tent"'))
  assert.doesNotMatch(definitionOf('linux', o), /WorkingDirectory/)
  // tent service writes the folder it was typed in.
  const folder = workOf(t, 'service-folder')
  const { project, bundle } = await builtShop(folder)
  const printed = await typed(['service', bundle, '--data', join(folder, 'data')], project)
  assert.equal(printed.code, 0, printed.out)
  assert.ok(
    printed.out.includes(process.platform === 'win32' ? project.replaceAll('&', '&amp;') : project),
    printed.out,
  )
})

test('[41-13a] each of the three forms holds what the system reads, with every word written as that form asks', () => {
  const words = ['start', 'C:\\apps\\100% shop & co', '--data', '/var/a "b" <c>', '--domain', "shop.test,o'k.test"]
  const o = { name: 'shop', user: 'ada', home: '/home/ada/.tent', words, machine: false }
  const unit = definitionOf('linux', o)
  for (const line of [
    '[Unit]',
    'Description=shop (Tent.js)',
    'After=network-online.target',
    '[Service]',
    'User=ada',
    'Restart=always',
    'RestartSec=2',
    'AmbientCapabilities=CAP_NET_BIND_SERVICE',
    'CapabilityBoundingSet=CAP_NET_BIND_SERVICE',
    'NoNewPrivileges=true',
    '[Install]',
    'WantedBy=multi-user.target',
  ])
    assert.ok(unit.split('\n').includes(line), line)
  // A % is doubled in a unit, and each word is quoted.
  const exec = unit.split('\n').find((one) => one.startsWith('ExecStart='))
  assert.equal(
    exec,
    'ExecStart="/home/ada/.tent/bin/tent" "start" "C:\\\\apps\\\\100%% shop & co" "--data" "/var/a \\"b\\" <c>" "--domain" "shop.test,o\'k.test"',
  )
  const person = definitionOf('darwin', o)
  assert.match(person, /<key>Label<\/key>\s*<string>com\.tentjs\.shop<\/string>/)
  assert.match(person, /<key>RunAtLoad<\/key>\s*<true\/>/)
  assert.match(person, /<key>KeepAlive<\/key>\s*<true\/>/)
  assert.ok(person.includes('<string>C:\\apps\\100% shop &amp; co</string>'))
  assert.ok(
    person.includes('<string>/var/a "b" &lt;c&gt;</string>') ||
      person.includes('<string>/var/a &quot;b&quot; &lt;c&gt;</string>'),
  )
  assert.doesNotMatch(person, /UserName/)
  const machine = definitionOf('darwin', { ...o, machine: true })
  assert.match(machine, /<key>UserName<\/key>\s*<string>ada<\/string>/)
  const task = definitionOf('win32', { ...o, home: 'C:\\Users\\ada\\.tent' })
  assert.match(task, /<LogonTrigger>/)
  assert.match(task, /<Command>C:\\Users\\ada\\\.tent\\bin\\tentw\.exe<\/Command>/)
  assert.match(task, /<RestartOnFailure>\s*<Interval>PT1M<\/Interval>/)
  assert.doesNotMatch(task, /<Password>/)
  assert.ok(task.includes('&amp;') && task.includes('&lt;c&gt;'))
  assert.match(definitionOf('win32', { ...o, machine: true }), /<BootTrigger>/)
  // The words come back as they were typed, by the rules the launcher reads them by.
  assert.deepEqual(wordsOf(task), words)
})

test('[41-13a] a word with a line break is refused, and so are a data folder that others can write and a file of the key that others can read', async (t) => {
  const folder = workOf(t, 'refused')
  const { project, bundle } = await builtShop(folder)
  const broken = await typed(['service', bundle, '--data', `${folder}\nExecStartPre=/bin/sh`], project)
  assert.equal(broken.code, 1)
  assert.match(broken.out, /line break/)
  const open = join(folder, 'open')
  mkdirSync(open)
  if (process.platform === 'win32')
    spawnSync('icacls', [open, '/grant', '*S-1-1-0:(OI)(CI)M', '/q'], { stdio: 'ignore', windowsHide: true })
  else spawnSync('chmod', ['777', open])
  const opened = await typed(['service', bundle, '--data', open], project)
  assert.equal(opened.code, 1)
  assert.match(opened.out, /others can write/)
  const key = join(folder, 'secret.key.txt')
  writeFileSync(key, 'k'.repeat(44))
  if (process.platform === 'win32')
    spawnSync('icacls', [key, '/grant', '*S-1-1-0:R', '/q'], { stdio: 'ignore', windowsHide: true })
  else spawnSync('chmod', ['644', key])
  const read = await typed(['service', bundle, '--data', join(folder, 'data'), '--secret-key-from', key], project)
  assert.equal(read.code, 1)
  assert.match(read.out, /may read it/)
})

test('[41-13a] the launcher starts the player again after it ended with 75', async (t) => {
  const rel = await released('1.0.0')
  const folder = outsideFolderOf(t, 'again')
  const home = join(folder, 'tent-home')
  const launcher = laidInstall(rel, home, ['runtime', 'player'])
  // The player of this install ends with 75 once, as after an update it took by itself, and then answers.
  const mark = join(folder, 'ended-once')
  writeFileSync(
    join(home, 'versions', rel.version, 'player', 'tent.mjs'),
    `import { existsSync, writeFileSync } from 'node:fs'\nif (!existsSync(${JSON.stringify(mark)})) { writeFileSync(${JSON.stringify(mark)}, ''); process.exit(75) }\nconsole.log('started again')\n`,
  )
  const env: Record<string, string> = { TENT_HOME: home }
  for (const [name, value] of Object.entries(process.env))
    if (value !== undefined && name !== 'TENT_HOME') env[name] = value
  const done = await ran(launcher, ['start'], { cwd: folder, env })
  assert.equal(done.status, 0, done.err)
  assert.match(done.out, /started again/)
  assert.ok(existsSync(mark))
})

test(
  '[41-13a] tent service --install writes the definition where the system reads it, makes the file of the key, and writes over one of that name only with --yes',
  onClean,
  async (t) => {
    // A test that is owed runs all the same: it stops here, before it writes into the system.
    assert.ok(clean, 'this is a clean machine of the owner, which TENT_CLEAN_MACHINE=yes names')
    const folder = workOf(t, 'install')
    const { project, bundle } = await builtShop(folder)
    const data = join(folder, 'data')
    // The data folder is the user's alone, as a server's is.
    mkdirSync(data)
    if (process.platform === 'win32')
      spawnSync('icacls', [
        data,
        '/inheritance:r',
        '/grant:r',
        `${process.env.USERDOMAIN}\\${process.env.USERNAME}:(OI)(CI)F`,
        '/q',
      ])
    else spawnSync('chmod', ['700', data])
    const key = join(folder, 'shop.key')
    const words = ['service', bundle, '--data', data, '--secret-key-from', key, '--install']
    const first = await typed(words, project)
    assert.equal(first.code, 0, first.out)
    assert.ok(existsSync(key))
    assert.ok(readFileSync(key, 'utf8').trim().length >= 32)
    const again = await typed(words, project)
    assert.equal(again.code, 1)
    assert.match(again.out, /--yes/)
    assert.equal((await typed([...words, '--yes'], project)).code, 0)
  },
)

test(
  '[41-13a] the app starts with the sign-in or with the machine, by the definition that --install wrote',
  onClean,
  () => {
    assert.ok(
      clean,
      'this is a clean machine of the owner, which TENT_CLEAN_MACHINE=yes names, and it is started again',
    )
  },
)

test('[41-13a] tent service --install as root with no --user stops and names the user to type', onRoot, async (t) => {
  assert.ok(asRoot, 'the tests run as root or as an administrator here')
  const folder = workOf(t, 'root')
  const { project, bundle } = await builtShop(folder)
  const stopped = await typed(['service', bundle, '--data', join(folder, 'data'), '--install'], project)
  assert.equal(stopped.code, 1)
  assert.match(stopped.out, /--user/)
})

test('[41-12.15] a file name typed by a user of the app that holds the signs of a shell is never handed to one', async (t) => {
  const folder = workOf(t, 'shell-signs')
  const { project, bundle } = await builtShop(folder)
  const signs = join(tmpdir(), `tent-signs-${process.pid}`)
  const data = join(folder, `a;b & c $(touch ${signs}) \`touch ${signs}\` | d`)
  const printed = await typed(['service', bundle, '--data', data, '--line'], project)
  assert.equal(printed.code, 0, printed.out)
  // The name stands in the line as one word, quoted as the shell of the system reads it, and nothing ran it.
  assert.ok(printed.out.includes(data), printed.out)
  assert.equal(existsSync(signs), false)
})

test('[41-14] [41-12.15] tent start as root is refused without --as-root', onRoot, async (t) => {
  assert.ok(asRoot, 'the tests run as root or as an administrator here')
  const folder = workOf(t, 'as-root')
  const { project, bundle } = await builtShop(folder)
  const refused = await typed(['start', bundle, '--data', join(folder, 'data'), '--port', '0'], project)
  assert.equal(refused.code, 1)
  assert.match(refused.out, /--as-root/)
})

test('[41-14] whether tent start runs as an administrator is the level of its own rights, which no program that the path finds first answers', (t) => {
  // A program named `net` first on the path that ends well, as the list of the shared sessions answers an
  // administrator: it is never asked, and no program of that name is asked for the rights of this one.
  const tools = mkdtempSync(join(tmpdir(), 'tent-net-'))
  t.after(() => rmSync(tools, { recursive: true, force: true }))
  if (process.platform === 'win32') copyFileSync(join(system32, 'cmd.exe'), join(tools, 'net.exe'))
  const before = process.env.PATH
  process.env.PATH = `${tools}${process.platform === 'win32' ? ';' : ':'}${before ?? ''}`
  t.after(() => {
    process.env.PATH = before
  })
  assert.equal(runsAsRoot(), asRoot)
})
