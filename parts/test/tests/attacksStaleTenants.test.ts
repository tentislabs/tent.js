import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import { createEngine } from '../../engine/index.ts'
import { closing, copyOf } from './projects.ts'
import { untilWithin } from './remotes.ts'

// The news of each team stand in a data file of that team, and the page of a team is public.
const functions = `
import { anyone, change, input, link, query, table, text } from 'tentjs'

const open = anyone('the news of a team are public')

export const teams = table('teams', { columns: { name: text() }, access: { read: 'anyone', add: 'anyone' } })

export const posts = table('posts', {
  columns: { team: link('teams'), title: text() },
  tenant: 'team',
  access: { read: 'anyone', add: 'anyone' },
})

export const postsOf = query('postsOf', { access: open, input: { team: text() }, rows: posts.of(input('team')).oldest('title') })

export const addTeam = change('addTeam', { access: open, input: { name: text() }, output: text(), run: ({ input: given, db }) => db.teams.add({ name: given.name }).id })

export const addPost = change('addPost', {
  access: open,
  input: { team: text(), title: text() },
  set: posts.of(input('team')).add({ team: input('team'), title: input('title') }),
})
`

const screens = `
import { screen, read } from 'tentjs/ui'
import { postsOf } from './teamPosts'

export const teamScreen = screen('teamScreen', {
  path: '/teams/:team',
  access: 'anyone',
  title: 'A team',
  cache: { for: '1 minute', public: true },
  data: ({ params }) => ({ all: read(postsOf, { team: params.team }) }),
  view: ({ all }) => <h1>{all.length} posts</h1>,
})
`

/** Every `page.stale` that the flow of the project was handed, in the order it was handed them. */
function toldOf(dataFolder: string): { addresses?: { address: string }[]; keys?: string[] }[] {
  const data = new DatabaseSync(join(dataFolder, 'data.db'), { readOnly: true })
  try {
    return data
      .prepare('SELECT told FROM "staleNotes" ORDER BY rowid')
      .all()
      .map((row) => JSON.parse(String(row.told)))
  } catch {
    return []
  } finally {
    data.close()
  }
}

test('[44-10.7] the keys header and page.stale name a tenant only on the answer that read that tenant file', async (t) => {
  const folder = copyOf(t, 'staled')
  writeFileSync(join(folder, 'teamPosts.ts'), functions)
  writeFileSync(join(folder, 'teamScreens.tsx'), screens)
  const made = await buildProject(folder, { for: 'release', out: join(folder, 'bundle') })
  assert.deepEqual(
    made.findings.filter((one) => one.level === 'error').map((one) => `${one.code} ${one.message}`),
    [],
  )
  const dataFolder = join(folder, 'data')
  const engine = createEngine({ port: 0 })
  closing(t, () => engine.close())
  const app = await engine.open(made.bundleFolder, { dataFolder, mode: 'test' })
  const { port } = JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8'))
  const address = `http://localhost:${port}`
  const system = { as: { kind: 'system' } } as const
  const red = String(await app.call('addTeam', { name: 'Red' }, system))
  const blue = String(await app.call('addTeam', { name: 'Blue' }, system))
  await app.call('addPost', { team: red, title: 'Red news' }, system)
  await app.call('addPost', { team: blue, title: 'Blue news' }, system)
  const keysAt = async (team: string): Promise<string[]> => {
    const answer = await fetch(`${address}/teams/${team}`)
    await answer.text()
    assert.match(String(answer.headers.get('cache-control')), /^public/)
    return String(answer.headers.get('surrogate-key')).split(' ')
  }
  const ofRed = await keysAt(red)
  const ofBlue = await keysAt(blue)
  // Each answer names the file of its own tenant, and no other.
  assert.ok(ofRed.includes(`t:posts:${red}`), ofRed.join(' '))
  assert.equal(ofRed.includes(`t:posts:${blue}`), false)
  assert.ok(ofBlue.includes(`t:posts:${blue}`), ofBlue.join(' '))
  assert.equal(ofBlue.includes(`t:posts:${red}`), false)
  // A write to the file of one tenant tells the keys of that tenant alone, and the address that read it.
  const before = toldOf(dataFolder).length
  await app.call('addPost', { team: blue, title: 'More blue news' }, system)
  await untilWithin('the flow is handed what went stale', () => toldOf(dataFolder).length > before, 10_000)
  const told = toldOf(dataFolder).at(-1)
  assert.equal(told?.keys?.includes(`t:posts:${red}`), false, JSON.stringify(told))
  assert.ok(told?.keys?.includes(`t:posts:${blue}`), JSON.stringify(told))
  assert.deepEqual(
    told?.addresses?.map((one) => one.address),
    [`/teams/${blue}`],
  )
})
