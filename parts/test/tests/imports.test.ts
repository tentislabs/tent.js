import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { runKilled } from '../../../rig/kill.ts'
import { buildProject } from '../../build/index.ts'
import type { TestApp } from '../index.ts'
import { appIn, command, dataPlace, openOn } from './desks.ts'
import { copyOf } from './projects.ts'

const system = { as: { kind: 'system' } } as const

/** One member as a file of the test writes it: a fifth of them in the blue team. */
const memberOf = (i: number) => ({
  name: `Member ${i}`,
  born: { day: 1 + (i % 28), month: 1 + (i % 12), year: 1950 + (i % 50) },
  height: 150 + (i % 50) + 0.5,
  joined: { day: 3, month: 2, year: 2001, hour: i % 24, minute: 30 },
  team: i % 5 === 0 ? 'blue' : 'red',
})

const two = (n: number): string => String(n).padStart(2, '0')

/** The members of a file of a thousand: lines 11, 21 and 31 are wrong, and line 41 names the member of line 2 again. */
function members(n = 1000): ReturnType<typeof memberOf>[] {
  return Array.from({ length: n }, (_, at) => memberOf(at + 1))
}

/** A CSV as a German spreadsheet writes it: `;` between fields, a comma before the decimals, days first. */
function germanCsv(n = 1000): string {
  const lines = ['Full name;born;height;joined;team;active']
  for (const [at, one] of members(n).entries()) {
    const line = at + 2
    const born = `${two(one.born.day)}.${two(one.born.month)}.${one.born.year}`
    const joined = `${two(one.joined.day)}.${two(one.joined.month)}.${one.joined.year} ${two(one.joined.hour)}:${two(one.joined.minute)}`
    const height = line === 11 ? 'groß' : String(one.height).replace('.', ',')
    const name = line === 21 ? '' : line === 41 ? 'Member 1' : one.name
    const team = line === 31 ? 'Grün' : one.team === 'blue' ? 'Blau' : 'Rot'
    lines.push([name, born, height, joined, team, at % 2 ? 'false' : 'true'].join(';'))
  }
  return `${lines.join('\r\n')}\r\n`
}

/** The same members as JSON lines, with each value as JSON holds it: where `wrong`, line 10 is born on no day. */
function jsonLines(n = 1000, wrong = true): string {
  return members(n)
    .map((one, at) =>
      JSON.stringify({
        'Full name': one.name,
        born: wrong && at === 9 ? 'not a day' : `${one.born.year}-${two(one.born.month)}-${two(one.born.day)}`,
        height: one.height,
        joined: `${one.joined.year}-02-03T${two(one.joined.hour)}:30:00Z`,
        team: one.team,
      }),
    )
    .join('\n')
}

/** A workbook of two sheets, as the stand-in of the spreadsheet reader reads one: members, and a sheet of notes. */
function workbook(n = 1000): string {
  const rows: unknown[][] = [['Full name', 'born', 'height', 'joined', 'team']]
  for (const one of members(n))
    rows.push([
      `Listed ${one.name}`,
      `${one.born.year}-${two(one.born.month)}-${two(one.born.day)}`,
      one.height,
      { date: `${one.joined.year}-02-03T${two(one.joined.hour)}:30:00.000Z` },
      one.team,
    ])
  return JSON.stringify({
    Members: rows,
    Notes: [
      ['Full name', 'born'],
      ['Not a member', 'never'],
    ],
  })
}

/** The club, and a member of its staff. The reader of spreadsheets stands in the runner's folder of the test. */
async function club(t: TestContext): Promise<{ app: TestApp; dataFolder: string; folder: string; staff: string }> {
  const folder = copyOf(t, 'imported')
  const { app, dataFolder } = await appIn(t, folder)
  const staff = await app.user({ name: 'Ada', roles: ['staff'] })
  return { app, dataFolder, folder, staff: String(staff.user?.id) }
}

/** The rows of the members, as the system reads them, by their names. */
async function membersIn(app: TestApp): Promise<Map<string, Record<string, unknown>>> {
  const read: unknown = await app.read({ from: 'members' }, system)
  const rows: Record<string, unknown>[] = Array.isArray(read) ? read : []
  return new Map(rows.map((row) => [String(row.name), row]))
}

/** The lines of a file of refused records, past its header. */
const refusedIn = (file: string): string[][] =>
  readFileSync(file, 'utf8')
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split(','))

test('[45-9] a CSV of a thousand records imports through a change, as the caller it names, with dates and numbers read in the language of the file and the records it refuses listed by line and field beside it', async (t) => {
  const { app, dataFolder, folder, staff } = await club(t)
  const file = join(folder, 'members.csv')
  writeFileSync(file, germanCsv())
  const said: Record<string, unknown> = Object(
    await command(app, dataFolder, 'data', {
      what: 'import',
      file,
      with: 'addMember',
      map: ['Full name=name'],
      language: 'de',
      as: staff,
    }),
  )
  assert.deepEqual([said.records, said.imported, said.refused], [1000, 996, 4])
  assert.equal(said.refusedFile, `${file}.refused.csv`)
  const refused = refusedIn(`${file}.refused.csv`)
  assert.deepEqual(
    refused.map((line) => line.slice(0, 2)),
    [
      ['11', 'height'],
      ['21', 'name'],
      ['31', 'team'],
      ['41', 'name'],
    ],
  )
  const rows = await membersIn(app)
  assert.equal(rows.size, 996)
  const fifth = rows.get('Member 5')
  assert.equal(fifth?.born, '1955-06-06')
  assert.equal(fifth?.height, 155.5)
  assert.equal(new Date(String(fifth?.joined)).toISOString(), '2001-02-03T05:30:00.000Z')
  assert.equal(fifth?.team, 'blue', 'a choice is read by its word in the language of the file')
  assert.equal(rows.get('Member 2')?.active, false)
  assert.equal(fifth?.by, staff, 'the change was called as the caller that was named')
  // As nobody of the staff, the rule of the change refuses every record: an import writes nothing past its change.
  const other = await app.user({ name: 'Bob', roles: [] })
  const second = join(folder, 'more.csv')
  writeFileSync(second, 'Full name;born;height;joined;team\nNew;01.01.2000;170;01.01.2020 10:00;Rot\n')
  const refusedAll: Record<string, unknown> = Object(
    await command(app, dataFolder, 'data', {
      what: 'import',
      file: second,
      with: 'addMember',
      map: ['Full name=name'],
      language: 'de',
      as: String(other.user?.id),
    }),
  )
  assert.deepEqual([refusedAll.imported, refusedAll.refused], [0, 1])
  assert.equal((await membersIn(app)).has('New'), false)
})

test('[45-9] JSON lines and a spreadsheet of a thousand records each import through the change, and each record that does not fit is named by its line and its field', async (t) => {
  const { app, dataFolder, folder } = await club(t)
  const lines = join(folder, 'members.jsonl')
  writeFileSync(lines, jsonLines())
  const fromLines: Record<string, unknown> = Object(
    await command(app, dataFolder, 'data', { what: 'import', file: lines, with: 'addMember', map: ['Full name=name'] }),
  )
  assert.deepEqual([fromLines.records, fromLines.imported, fromLines.refused], [1000, 999, 1])
  assert.deepEqual(refusedIn(`${lines}.refused.csv`)[0].slice(0, 2), ['10', 'born'])
  assert.equal((await membersIn(app)).size, 999)
  const sheet = join(folder, 'members.xlsx')
  writeFileSync(sheet, workbook())
  const fromSheet: Record<string, unknown> = Object(
    await command(app, dataFolder, 'data', { what: 'import', file: sheet, with: 'addMember', map: ['Full name=name'] }),
  )
  // Each sheet is read by its name: the sheet of notes holds one record that is no member.
  assert.deepEqual([fromSheet.records, fromSheet.imported, fromSheet.refused], [1001, 1000, 1])
  assert.deepEqual(refusedIn(`${sheet}.refused.csv`)[0].slice(0, 2), ['Notes:2', 'born'])
  const rows = await membersIn(app)
  assert.equal(rows.size, 1999)
  assert.equal(new Date(String(rows.get('Listed Member 7')?.joined)).toISOString(), '2001-02-03T07:30:00.000Z')
})

test('[45-9] an import with `--dry` checks every record, names those it refuses, and writes nothing', async (t) => {
  const { app, dataFolder, folder, staff } = await club(t)
  const file = join(folder, 'members.csv')
  writeFileSync(file, germanCsv(100))
  const said: Record<string, unknown> = Object(
    await command(app, dataFolder, 'data', {
      what: 'import',
      file,
      with: 'addMember',
      map: ['Full name=name'],
      language: 'de',
      as: staff,
      dry: true,
    }),
  )
  assert.deepEqual([said.dry, said.records, said.imported, said.refused], [true, 100, 96, 4])
  assert.equal(refusedIn(`${file}.refused.csv`).length, 4)
  assert.equal((await membersIn(app)).size, 0)
})

test('[45-9] a person imports a file they uploaded through a function, as themselves: the function answers a run of the kind import, which a page follows, and whose answer hands them the records it refused as a file of their own', async (t) => {
  const { app, staff } = await club(t)
  const browser = app.browser({ as: staff })
  const csv = [
    'Full name,born,height,joined,team',
    'Ann,1990-02-03,170.5,2020-01-01T10:00:00Z,red',
    'Ben,1991-03-04,tall,2020-01-01T10:00:00Z,blue',
    'Cy,1992-04-05,180,2020-01-01T10:00:00Z,Blue',
  ].join('\n')
  const uploaded = Object(await browser.upload(csv, { name: 'members.csv', kind: 'text/csv' })).value?.id
  const answer = Object(await browser.call('importMembers', { members: String(uploaded) }))
  assert.equal(answer.ok, true, JSON.stringify(answer))
  const run = String(Reflect.get(Object(answer.value), 'run'))
  const said: Record<string, unknown> = Object(await app.runs.wait(run))
  assert.deepEqual([said.records, said.imported, said.refused], [3, 2, 1])
  // The run is the person's own, of the kind import, with its one step done.
  const view = app.runs.read(run)
  assert.deepEqual(
    [view?.kind, view?.state, view?.startedBy, view?.steps.map((one) => [one.name, one.state])],
    ['import', 'done', { kind: 'user', id: staff }, [['import', 'done']]],
  )
  const rows = await membersIn(app)
  assert.deepEqual([...rows.keys()].sort(), ['Ann', 'Cy'])
  assert.equal(rows.get('Ann')?.by, staff)
  assert.equal(rows.get('Cy')?.team, 'blue', 'a choice is read by its word')
  const listed = await browser.request('GET', `/_t/files/${String(said.refusedFile)}`)
  assert.equal(listed.status, 200)
  assert.deepEqual((await listed.text()).trim().split(/\r?\n/).slice(1)[0]?.split(',').slice(0, 2), ['3', 'height'])
})

test('[45-9] an import that is killed at its middle goes on from its last page, and imports every record once', async (t) => {
  const project = copyOf(t, 'imported')
  // Pages of a hundred records: a kill falls between pages, or inside one, whose write is then lost whole.
  const tent = join(project, 'tent.ts')
  writeFileSync(
    tent,
    readFileSync(tent, 'utf8').replace(
      'backups: { every: false },',
      'backups: { every: false },\n  limits: { workPage: 100 },',
    ),
  )
  const built = await buildProject(project, { for: 'dev', out: join(project, 'bundle') })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error').map((one) => one.message),
    [],
  )
  const dataFolder = dataPlace(t)
  const first = await openOn(t, built.bundleFolder, dataFolder)
  await first.engine.close()
  const file = join(project, 'members.jsonl')
  writeFileSync(file, jsonLines(2000, false))
  const program = join(import.meta.dirname, 'killed', 'import.ts')
  const killed = await runKilled(program, {
    times: 4,
    within: 3000,
    seed: 9,
    args: [built.bundleFolder, dataFolder, file],
  })
  assert.equal(killed.kills, 4)
  const last = killed.ended.at(-1)
  assert.equal(last?.code, 0, String(last?.out))
  const told = JSON.parse(/^told: (.*)$/m.exec(last?.out ?? '')?.[1] ?? '{}')
  assert.deepEqual(told, { rows: 2000, names: 2000 }, 'every record was imported once')
})

test('[45-9] the reader of spreadsheets is a part fetched at its first use, from the address of SheetJS itself, pinned with its fingerprint', () => {
  const pinned: unknown[] = JSON.parse(readFileSync(new URL('../../engine/fetched.json', import.meta.url), 'utf8'))
  const lines = pinned.filter((line) => Reflect.get(Object(line), 'name') === 'xlsx')
  assert.equal(lines.length, 1)
  const [line] = lines
  assert.equal(Reflect.get(Object(line), 'from'), 'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz')
  assert.match(String(Reflect.get(Object(line), 'fingerprint')), /^sha512-[A-Za-z0-9+/]{86}==$/)
})
