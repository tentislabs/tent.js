import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Type } from '../../core/index.ts'
import { boolean, choice, json, list, number, object, text } from '../../core/index.ts'
import { checkValue, coreVersion } from '../../core/internal.ts'
import type { Command } from '../command.ts'
import { carryOut, tent } from '../shell.ts'

const root = join(import.meta.dirname, '..', '..', '..')
const shell = join(import.meta.dirname, '..', 'shell.ts')

/** An empty folder of its own under `results/`, for a test to make a project in. */
function emptied(name: string): string {
  const folder = join(root, 'results', 'cli', name)
  rmSync(folder, { recursive: true, force: true })
  mkdirSync(folder, { recursive: true })
  return folder
}

/** Carries a command out in a folder, as it is typed, and answers what it printed and the number it ended with. */
async function typed(folder: string, ...words: string[]): Promise<{ ended: number; printed: string }> {
  const lines: string[] = []
  const ended = await tent(words, { folder, out: (line) => lines.push(line) })
  return { ended, printed: lines.join('\n') }
}

/** The shape of one finding as a command prints it with `--json`. */
const finding = object({
  code: text({ pattern: '^T\\d{4}$' }),
  name: text(),
  message: text(),
  level: choice(['error', 'warning', 'note']),
  docs: text({ pattern: '^tent docs T\\d{4}$' }),
  fix: text({ optional: true }),
  where: object({ file: text(), line: number(), definition: text({ optional: true }) }, { optional: true }),
})

/** What every command prints with `--json`, around the shape of its own value. */
const printed = (value: Type): Type => object({ ok: boolean(), value, findings: list(finding) })

/** The stored shape of the value of each command. */
const shapes: Record<string, Type> = {
  new: object({ folder: text(), files: list(text()) }),
  check: object({ definitions: json(), why: json() }),
  build: object({ version: text({ pattern: '^[0-9a-f]{32}$' }), bundle: text() }),
  docs: text({ min: 20 }),
  map: text({ min: 20 }),
}

test('[15-4] tent new, then tent check, passes with no finding', () => {
  const folder = emptied('new')
  // The two commands are typed as a person types them: each as a program of its own.
  const run = (cwd: string, ...words: string[]) =>
    spawnSync(process.execPath, [shell, ...words], { cwd, encoding: 'utf8', timeout: 60000 })
  const made = run(folder, 'new', 'my-app')
  assert.equal(made.status, 0, made.stdout + made.stderr)
  const project = join(folder, 'my-app')
  // What a new project holds, and nothing else: its files, and the history that holds its first point.
  assert.deepEqual(
    readdirSync(project, { recursive: true })
      .map(String)
      .map((one) => one.replaceAll('\\', '/'))
      .sort(),
    [
      '.gitignore',
      '.tent',
      '.tent/history.db',
      'AGENTS.md',
      'functions',
      'functions/greeting.ts',
      'package.json',
      'screens',
      'screens/home.tsx',
      'tent.ts',
    ],
  )
  assert.match(readFileSync(join(project, '.gitignore'), 'utf8'), /^\.tent\/$/m)
  // The type list is a made file: git leaves it out.
  assert.match(readFileSync(join(project, '.gitignore'), 'utf8'), /^tent\.d\.ts$/m)
  // An ordinary package file: the name of the folder, never published, its files modules, and the framework at
  // the version that wrote it.
  assert.deepEqual(JSON.parse(readFileSync(join(project, 'package.json'), 'utf8')), {
    name: 'my-app',
    private: true,
    type: 'module',
    engines: { tentjs: coreVersion },
  })
  assert.match(coreVersion, /^\d+\.\d+$/)
  const agents = readFileSync(join(project, 'AGENTS.md'))
  assert.ok(agents.length <= 8 * 1024, `AGENTS.md is ${agents.length} bytes, and at most 8 kB`)
  for (const word of [
    'project',
    'table',
    'query',
    'change',
    'action',
    'flow',
    'screen',
    'component',
    'service',
    'model',
  ])
    assert.match(agents.toString('utf8'), new RegExp(`= ${word}\\('`), `AGENTS.md shows ${word} by an example`)
  assert.match(agents.toString('utf8'), /Run `tent check` after every change/)

  const checked = run(project, 'check', '--json')
  assert.equal(checked.status, 0, checked.stdout + checked.stderr)
  const answer = JSON.parse(checked.stdout)
  assert.deepEqual(answer.findings, [])
  assert.equal(answer.ok, true)
  assert.deepEqual(answer.value.definitions, { greeting: 'plain', homeScreen: 'code', myApp: 'plain' })
  // As text, a check with nothing found prints the form of each definition and ends with 0.
  const asText = run(project, 'check')
  assert.equal(asText.status, 0)
  assert.match(asText.stdout, /^definitions:\n {2}greeting: plain\n {2}homeScreen: code\n/)
})

test('[15-6] the output of each command with --json has its stored shape, and tent map prints a stored text for the project of tent new', async () => {
  const folder = emptied('shapes')
  const outputs: Record<string, { ended: number; printed: string }> = {
    new: await typed(folder, 'new', 'tasks-app', '--json'),
  }
  const project = join(folder, 'tasks-app')
  outputs.check = await typed(project, 'check', '--json')
  outputs.build = await typed(project, 'build', '--json')
  outputs.docs = await typed(project, 'docs', 'T1003', '--json')
  outputs.map = await typed(project, 'map', '--json')
  assert.deepEqual(Object.keys(outputs).sort(), Object.keys(shapes).sort())
  for (const [name, output] of Object.entries(outputs)) {
    assert.equal(output.ended, 0, `tent ${name} ends with 0: ${output.printed}`)
    const answer: unknown = JSON.parse(output.printed)
    assert.deepEqual(checkValue(printed(shapes[name]), answer), [], `the shape of tent ${name} --json`)
    assert.deepEqual(Object(answer).findings, [], name)
    assert.equal(Object(answer).ok, true, name)
  }
  // One member more is no shape of a command: the stored shapes do hold what is printed.
  assert.equal(
    checkValue(printed(shapes.docs), { ok: true, value: 'a page of the docs, in words', findings: [], more: 1 }).length,
    1,
  )
  const built = JSON.parse(outputs.build.printed).value
  assert.ok(existsSync(join(built.bundle, 'description.json')), 'tent build wrote the bundle')
  assert.match(JSON.parse(outputs.docs.printed).value, /^# T1003 unknown-option\n/)

  const map = await typed(project, 'map')
  assert.equal(map.ended, 0)
  const stored = readFileSync(join(import.meta.dirname, 'expected', 'map.txt'), 'utf8').replace(/\r\n/g, '\n')
  assert.equal(`${map.printed}\n`, stored)
  assert.equal(JSON.parse(outputs.map.printed).value, stored)

  // How a command ends. 1: an error among what was found, and with it no bundle and no value.
  writeFileSync(
    join(project, 'functions', 'more.ts'),
    "import { query } from 'tentjs'\n\nexport const broken = query('broken', {})\n",
  )
  const failing = await typed(project, 'build', '--json')
  assert.equal(failing.ended, 1)
  const refused = JSON.parse(failing.printed)
  assert.deepEqual(checkValue(printed(json({ optional: true })), refused), [])
  assert.equal(refused.ok, false)
  assert.equal(refused.value, null)
  assert.ok(refused.findings.some((one: { code: string }) => one.code === 'T1008'))
  // As text, a finding is printed in its form: the level and the code, the place and the definition, the fix, the page.
  const words = await typed(project, 'check')
  assert.equal(words.ended, 1)
  assert.match(
    words.printed,
    /^error T1008 {2}functions\/more\.ts:3 {2}broken\n {2}broken: query states no `access`, which is required\.\n {2}fix: State `access`\.\n {2}more: tent docs T1008$/m,
  )
  // 2: the command itself failed. A command that is not there, a flag it does not take, a page that is not there,
  // and a folder that holds no project.
  for (const words of [['nothing'], ['build', '--fast'], ['docs', 'no-such-page'], ['new']]) {
    const failed = await typed(project, ...words, '--json')
    assert.equal(failed.ended, 2, words.join(' '))
    const answer = JSON.parse(failed.printed)
    assert.deepEqual(checkValue(printed(json({ optional: true })), answer), [], words.join(' '))
    assert.equal(answer.ok, false)
    assert.equal(answer.findings.length, 1)
  }
  assert.equal((await typed(folder, 'map')).ended, 2)
  // With no command, the shell says which it has.
  const bare = await typed(project)
  assert.equal(bare.ended, 0)
  const named = bare.printed
    .replace(/^[^:]*: /, '')
    .replace(/\. .*$/s, '')
    .split(', ')
  for (const name of ['build', 'check', 'docs', 'map', 'new'])
    assert.ok(named.includes(name), `${name}: ${bare.printed}`)
})

/** A list of commands that no step ships, as the list of a folder holds them: a command of a folder as `<folder>/<file>`. */
const planted = (commands: Record<string, Command>) =>
  Object.entries(commands).map(([name, command]) => ({ name, load: async () => ({ command }) }))

/** Carries a command of a planted list out in a folder, as it is typed, and answers what it printed and the number it ended with. */
async function among(
  commands: Record<string, Command>,
  folder: string,
  ...words: string[]
): Promise<{ ended: number; printed: string; value: unknown; message: string }> {
  const lines: string[] = []
  const ended = await carryOut(planted(commands), words, { folder, out: (line) => lines.push(line) })
  const printed = lines.join('\n')
  const answer = words.includes('--json') && printed.startsWith('{') ? Object(JSON.parse(printed)) : {}
  return { ended, printed, value: answer.value, message: String(Object(answer.findings?.[0]).message ?? '') }
}

/** A command that answers what it was handed, under the name it was planted with. */
const echo = (name: string, args: Record<string, Type>, needs: Command['needs'] = 'nothing'): Command => ({
  name,
  args,
  needs,
  run: async (o) => ({ value: { did: name, args: o.args, folder: o.folder } }),
})

test('[15-6] a command that is a file of a folder is typed as two words, and by no other form', async () => {
  const folder = emptied('two-words')
  const commands = {
    'data/backup': echo('data backup', {}),
    'data/rows': echo('data rows', { table: text() }),
    logs: echo('logs', { since: text({ optional: true }) }),
  }
  const rows = await among(commands, folder, 'data', 'rows', 'orders', '--json')
  assert.equal(rows.ended, 0, rows.printed)
  assert.deepEqual(rows.value, { did: 'data rows', args: { table: 'orders' }, folder })
  // `--json` stands where it is typed: before the two words, between them and after them.
  for (const words of [
    ['--json', 'data', 'rows', 'orders'],
    ['data', '--json', 'rows', 'orders'],
    ['data', 'rows', '--table', 'orders', '--json'],
  ])
    assert.deepEqual((await among(commands, folder, ...words)).value, rows.value, words.join(' '))
  assert.deepEqual(Object((await among(commands, folder, 'data', 'backup', '--json')).value).did, 'data backup')
  // A command of one word takes the word after it as its own.
  assert.deepEqual(Object((await among(commands, folder, 'logs', 'rows', '--json')).value).args, { since: 'rows' })

  // The folder alone is no command, and says which it holds. So is a second word that names no file of it.
  for (const words of [['data'], ['data', 'nothing'], ['data', '--table', 'orders']]) {
    const failed = await among(commands, folder, ...words, '--json')
    assert.equal(failed.ended, 2, words.join(' '))
    assert.match(failed.message, /^tent data needs one of: backup, rows\.$/, words.join(' '))
  }
  // One form for one job: the name of the list, with its slash, is not what is typed.
  const slashed = await among(commands, folder, 'data/rows', 'orders', '--json')
  assert.equal(slashed.ended, 2)
  assert.match(slashed.message, /^tent has no command "data\/rows"\. It has: data backup, data rows, logs\.$/)
  // What a command says of itself names it as it is typed.
  assert.match((await among(commands, folder, 'data', 'rows', '--json')).message, /^tent data rows needs <table>\.$/)
  assert.match((await among(commands, folder)).printed, /one of: data backup, data rows, logs\. /)
})

test('[15-6] tent --version and tent -v print the version of the tentjs that runs, in one line, and end with 0: from the sources, that they have none', async () => {
  const folder = emptied('version')
  for (const word of ['--version', '-v']) {
    const said = await typed(folder, word)
    assert.equal(said.ended, 0, said.printed)
    assert.equal(said.printed, 'This framework runs from its own sources, which have no version.')
    const json = await typed(folder, word, '--json')
    assert.equal(json.ended, 0, json.printed)
    assert.deepEqual(JSON.parse(json.printed), {
      ok: true,
      value: 'This framework runs from its own sources, which have no version.',
      findings: [],
    })
  }
})

test('[15-6] [16-2@11] a command typed with a word, a flag or a value it does not take, or without one it needs, ends with 2 and T0038: it names what was wrong, how the command is typed, and the nearest real word; T0009 stays for what went wrong inside', async () => {
  const folder = emptied('usage')
  const commands = {
    dev: echo('dev', {
      port: number({ optional: true }),
      mode: choice(['quick', 'whole'], { optional: true }),
      watch: boolean({ optional: true }),
    }),
    'data/backup': echo('data backup', {}),
    'data/rows': echo('data rows', { table: text() }),
    broken: {
      name: 'broken',
      args: {},
      needs: 'nothing',
      run: async () => {
        throw new Error('A part of the framework broke.')
      },
    } satisfies Command,
  }
  const devUsage = 'tent dev [--port <number>] [--mode <quick|whole>] [--watch]'
  const cases: [string[], RegExp, string][] = [
    [['dve'], /^tent has no command "dve"\./, 'Did you mean tent dev? It is typed: tent <command>, one of: '],
    [
      ['data', 'rowz'],
      /^tent data needs one of: backup, rows\.$/,
      'Did you mean tent data rows? It is typed: tent data <backup|rows>',
    ],
    [['dev', '--prot', '1'], /^tent dev takes no --prot\.$/, `Did you mean --port? It is typed: ${devUsage}`],
    [['dev', '--port'], /^--port of tent dev needs a value\.$/, `It is typed: ${devUsage}`],
    [['dev', '--port', 'many'], /--port of tent dev does not take "many"/, `It is typed: ${devUsage}`],
    [['dev', '--mode', 'slow'], /--mode of tent dev does not take "slow": quick, whole/, `It is typed: ${devUsage}`],
    // A word that is no flag fills the first value not given: with every one given it fills nothing.
    [
      ['dev', '--port', '1', '--mode', 'quick', 'extra'],
      /^tent dev does not take "extra"\.$/,
      `It is typed: ${devUsage}`,
    ],
    [['data', 'rows'], /^tent data rows needs <table>\.$/, 'It is typed: tent data rows --table <text>'],
  ]
  for (const [words, message, fix] of cases) {
    const lines: string[] = []
    const ended = await carryOut(planted(commands), [...words, '--json'], { folder, out: (line) => lines.push(line) })
    const said = Object(JSON.parse(lines.join('\n')))
    const found = Object(said.findings?.[0])
    assert.equal(ended, 2, words.join(' '))
    assert.equal(found.code, 'T0038', words.join(' '))
    assert.equal(found.name, 'usage', words.join(' '))
    assert.match(String(found.message), message, words.join(' '))
    assert.equal(String(found.fix).startsWith(fix), true, `${words.join(' ')}: ${found.fix}`)
  }
  // As text it names the code, what was wrong and how the command is typed.
  const shown = await among(commands, folder, 'dev', '--prot', '1')
  assert.equal(shown.ended, 2)
  assert.match(shown.printed, /T0038/)
  assert.match(shown.printed, /tent dev takes no --prot\./)
  assert.ok(shown.printed.includes(`It is typed: ${devUsage}`), shown.printed)
  // What breaks inside a command is no word of the person's: it is T0009.
  const broke = await among(commands, folder, 'broken', '--json')
  assert.equal(broke.ended, 2)
  assert.match(broke.printed, /"code": "T0009"/)
})

test('[15-6] a flag whose type is a list may be given several times, and holds every value in the order typed', async () => {
  const folder = emptied('several')
  const commands = {
    serve: echo('serve', {
      web: list(text(), { optional: true }),
      at: list(number(), { optional: true }),
      name: text({ optional: true }),
      needed: list(text()),
    }),
  }
  const args = async (...words: string[]) =>
    Object((await among(commands, folder, 'serve', ...words, '--json')).value).args
  assert.deepEqual(await args('--needed', 'x', '--web', 'open=10', '--web', 'atOnce=4', '--web=time=5 seconds'), {
    needed: ['x'],
    web: ['open=10', 'atOnce=4', 'time=5 seconds'],
  })
  // Each value is read by the type of an entry, and one that is given once is still a list.
  assert.deepEqual(await args('--needed', 'x', '--at', '3', '--at=4'), { needed: ['x'], at: [3, 4] })
  // A word that is no flag fills no list: it is the next thing that takes one value.
  assert.deepEqual(await args('--needed', 'x', '--needed', 'y', 'north'), { needed: ['x', 'y'], name: 'north' })
  // A list that is needed and not given is asked for, as any other.
  const none = await among(commands, folder, 'serve', '--json')
  assert.equal(none.ended, 2)
  assert.match(none.message, /^tent serve needs <needed>\.$/)
})

test('[15-6] a command that needs the engine finds it through --data, with no project, and through its project with none', async () => {
  const outside = emptied('data-flag')
  const commands = {
    logs: echo('logs', { data: text({ optional: true }) }, 'engine'),
    map: echo('map', { data: text({ optional: true }) }, 'project'),
  }
  // Outside a project, `--data` names the folder of the engine, and the command is handed the folder it was typed in.
  const far = await among(commands, outside, 'logs', '--data', 'kept', '--json')
  assert.equal(far.ended, 0, far.printed)
  assert.deepEqual(far.value, { did: 'logs', args: { data: 'kept' }, folder: outside })
  // With no `--data` the engine is the one of the project, so there must be one.
  const lost = await among(commands, outside, 'logs', '--json')
  assert.equal(lost.ended, 2)
  assert.match(lost.message, /^No project is here/)
  // A command that needs a project needs it whatever it takes.
  assert.equal((await among(commands, outside, 'map', '--data', 'kept', '--json')).ended, 2)

  // Inside a project the command is handed the folder of the project, with `--data` and without.
  const project = join(outside, 'shop')
  mkdirSync(join(project, 'functions'), { recursive: true })
  writeFileSync(
    join(project, 'tent.ts'),
    "import { project } from 'tentjs'\n\nexport const shop = project('shop', {})\n",
  )
  for (const words of [['logs'], ['logs', '--data', 'kept']]) {
    const near = await among(commands, join(project, 'functions'), ...words, '--json')
    assert.equal(near.ended, 0, near.printed)
    assert.equal(Object(near.value).folder, project, words.join(' '))
  }
})

test('[15-6] a command that states raw is handed the words after its name as they were typed, and the shell prints nothing and ends with its number', async () => {
  const folder = emptied('raw')
  const handed: { words: string[]; folder: string }[] = []
  const raw = (name: string, ends: number): Command => ({
    name,
    args: {},
    needs: 'nothing',
    raw: true,
    run: async (o) => {
      handed.push(o)
      return ends
    },
  })
  const commands = { cli: raw('cli', 7), 'box/open': raw('box open', 0) }
  // No word is read, taken out or held to anything: `--json` and a flag that the shell does not know among them.
  const words = ['shop', 'orders', '--json', '--limit=5', '--', 'data', '-x']
  const ran = await among(commands, folder, 'cli', ...words)
  assert.equal(ran.ended, 7)
  assert.equal(ran.printed, '')
  assert.deepEqual(handed, [{ words, folder }])
  // What was typed before the name is the shell's, and a command of a folder is handed what follows both words.
  assert.equal((await among(commands, folder, '--json', 'box', 'open', 'far', '--json')).ended, 0)
  assert.deepEqual(handed[1], { words: ['far', '--json'], folder })
  assert.equal((await among(commands, folder, 'box', 'open')).printed, '')
})

test('[15-6] the command of a folder lies in it under its own name and is typed with that name alone, and every other file of the folder is a sub-command', async () => {
  const folder = emptied('own-name')
  const commands = {
    'access/access': echo('access', { who: text({ optional: true }) }),
    'access/role': echo('access role', { name: text() }),
    'data/rows': echo('data rows', {}),
    logs: echo('logs', {}),
  }
  const did = async (...words: string[]) => Object((await among(commands, folder, ...words, '--json')).value)
  assert.deepEqual(await did('access'), { did: 'access', args: {}, folder })
  assert.deepEqual(await did('access', 'role', 'staff'), { did: 'access role', args: { name: 'staff' }, folder })
  // A word after the name that names no other file of the folder is a word of the command itself, its own name too.
  assert.deepEqual((await did('access', 'maya')).args, { who: 'maya' })
  assert.deepEqual(await did('access', 'access'), { did: 'access', args: { who: 'access' }, folder })
  assert.deepEqual((await did('access', '--who', 'role')).args, { who: 'role' })
  // It is named once, by its name alone, wherever the shell names its commands.
  assert.match((await among(commands, folder)).printed, /one of: access, access role, data rows, logs\. /)
  const slashed = await among(commands, folder, 'access/access', '--json')
  assert.equal(slashed.ended, 2)
  assert.match(
    slashed.message,
    /^tent has no command "access\/access"\. It has: access, access role, data rows, logs\.$/,
  )
  // A folder that holds no file of its own name is no command by itself.
  const none = await among(commands, folder, 'data', '--json')
  assert.equal(none.ended, 2)
  assert.match(none.message, /^tent data needs one of: rows\.$/)
})

test('[15-6] a word that is no flag fills what the command takes under a name that every object has', async () => {
  const folder = emptied('own-names')
  const commands = { find: echo('find', { constructor: text(), toString: text({ optional: true }) }) }
  const found = await among(commands, folder, 'find', 'north', 'south', '--json')
  assert.equal(found.ended, 0, found.printed)
  const args = Object(found.value).args
  assert.deepEqual([Reflect.get(args, 'constructor'), Reflect.get(args, 'toString')], ['north', 'south'])
  const none = await among(commands, folder, 'find', '--json')
  assert.equal(none.ended, 2)
  assert.match(none.message, /^tent find needs <constructor>\.$/)
})

test('[15-6@5] tent check answers the form of each definition as plain or code and no more, and what made a definition code in a field of its own', async () => {
  const folder = emptied('check-why')
  assert.equal((await typed(folder, 'new', 'my-app')).ended, 0)
  const project = join(folder, 'my-app')
  const file = join(project, 'functions', 'greeting.ts')
  const written = readFileSync(file, 'utf8')
  assert.match(written, /run: \(\) => 'Hello from /)
  const plain = await typed(project, 'check', '--json')
  assert.equal(plain.ended, 0, plain.printed)
  assert.equal(JSON.parse(plain.printed).value.definitions.greeting, 'plain')
  // One harmless call makes the function code.
  writeFileSync(file, written.replace("run: () => 'Hello from ", "run: () => String('Hello from ') + '"))
  const checked = await typed(project, 'check', '--json')
  assert.equal(checked.ended, 0, checked.printed)
  const value = JSON.parse(checked.printed).value
  assert.equal(value.definitions.greeting, 'code')
  assert.deepEqual(Object.keys(value.why), ['greeting'])
  assert.match(value.why.greeting, /^run: a call of `String`, a name that the body does not hold, on line \d+$/)
  // As text, the reason stands beside the form.
  const asText = await typed(project, 'check')
  assert.match(asText.printed, /^ {2}greeting: code$/m)
  assert.match(
    asText.printed,
    /^why:\n {2}greeting: run: a call of `String`, a name that the body does not hold, on line \d+$/m,
  )
})

test('[15-6] with --json the standard output holds the JSON alone, and what a plugin of the build prints goes to the standard error', () => {
  const project = join(emptied('json-alone'), 'shop')
  cpSync(join(import.meta.dirname, 'shop'), project, { recursive: true })
  writeFileSync(
    join(project, 'home.tsx'),
    "import { screen } from 'tentjs/ui'\n\nexport const homeScreen = screen('homeScreen', { path: '/', access: 'anyone', title: 'Home', view: () => <h1>Home</h1> })\n",
  )
  // A plugin that writes to the standard output while the build runs, as a library of styles writes its banner.
  writeFileSync(
    join(project, 'vite.config.ts'),
    "export default { plugins: [{ name: 'loud', buildStart() { console.log('/*! a banner */'); process.stdout.write('a line\\n') } }] }\n",
  )
  const { NODE_TEST_CONTEXT: _, ...env } = process.env
  const run = (words: string[], input: string) =>
    spawnSync(process.execPath, [shell, ...words], { cwd: project, encoding: 'utf8', timeout: 120_000, env, input })
  const asked: [string[], string][] = [
    [['build', '--json'], ''],
    [['secrets', 'set', 'shopKey', '--json'], 'a secret value\n'],
  ]
  for (const [words, input] of asked) {
    const ended = run(words, input)
    assert.equal(ended.status, 0, `${ended.stdout}\n${ended.stderr}`)
    assert.equal(JSON.parse(ended.stdout).ok, true, `tent ${words.join(' ')}: ${ended.stdout}`)
    assert.match(ended.stderr, /a banner \*\/\n[\s\S]*a line/, `tent ${words.join(' ')}`)
  }
})
