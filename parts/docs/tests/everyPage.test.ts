import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { findPage, pageNames, referenceText } from '../index.ts'

// The release asks a page for every code, command, word, option, tag, hook, handle and adapter: each is
// read here from where the code names it - the registry, the made lists, the entries, the types - and not typed.
const root = join(import.meta.dirname, '..', '..', '..')
const textOf = (path: string): string => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n')

/** The names of the entries of a made list of a folder of the framework. */
const listed = (path: string): string[] =>
  [...textOf(`${path}/list.ts`).matchAll(/name: '([^']+)'/g)].map((one) => one[1])

/** The lines of one part of the reference, under its heading. */
function partOf(heading: string): string[] {
  const lines = referenceText().split('\n')
  const start = lines.indexOf(`## ${heading}`)
  assert.ok(start >= 0, `the reference has the part ${heading}`)
  const end = lines.findIndex((line, at) => at > start && line.startsWith('## '))
  return lines.slice(start + 1, end < 0 ? undefined : end)
}

/** Each thing of a part of the reference, by the name its line begins with, with the names of the lines under it. */
function thingsOf(heading: string, name: RegExp): Map<string, string[]> {
  const things = new Map<string, string[]>()
  let last: string[] = []
  for (const line of partOf(heading)) {
    const member = /^ {2}(\w+)\??: /.exec(line)
    if (member) last.push(member[1])
    else {
      const found = name.exec(line)
      if (found) {
        last = things.get(found[1]) ?? []
        things.set(found[1], last)
      }
    }
  }
  return things
}

/** The file a module of the repository names by a relative path, from the file that names it. */
const fileOf = (from: string, path: string): string => join(dirname(from), path).replaceAll('\\', '/')

/**
 * What an entry file gives as a value, each name with the file that declares it, followed through each file that
 * hands it on. A name that only a type gives is no value.
 */
function valuesOf(file: string, seen = new Set<string>()): Map<string, string> {
  const found = new Map<string, string>()
  if (seen.has(file)) return found
  seen.add(file)
  const text = textOf(file)
  for (const [, names, from] of text.matchAll(/^export \{([^}]*)\} from '([^']+)'/gm)) {
    const there = valuesOf(fileOf(file, from), seen)
    for (const written of names
      .split(',')
      .map((one) => one.trim())
      .filter(Boolean)) {
      const [own, as = own] = written.split(/\s+as\s+/)
      found.set(as, there.get(own) ?? fileOf(file, from))
    }
  }
  for (const [, name] of text.matchAll(/^export (?:async )?(?:const|function|class) (\w+)/gm)) found.set(name, file)
  return found
}

test('[03-5] every code of the registry has its page under its own name, and every page of a code is a code of the registry', () => {
  const registry = new Map(
    [...textOf('parts/core/codes.ts').matchAll(/^ {2}(T\d{4}): '([^']+)'/gm)].map((one) => [one[1], one[2]]),
  )
  assert.ok(registry.size > 100, 'the registry is read')
  const missing = [...registry].filter(
    ([code, name]) => findPage(`code.${code}`)?.text.split('\n')[0] !== `# ${code} ${name}`,
  )
  assert.deepEqual(
    missing,
    [],
    `no page, or a page under another name, for ${missing.map(([code]) => code).join(', ')}`,
  )
  const stray = pageNames().filter((one) => one.startsWith('code.') && !registry.has(one.slice(5)))
  assert.deepEqual(stray, [])
})

test('[03-5] every entry of the made lists of commands, tags, hooks and handles has its page, and each command of a folder stands on the page of its folder', () => {
  const missing: string[] = []
  for (const [path, kind] of [
    ['parts/screens/tags', 'tag'],
    ['parts/screens/hooks', 'hook'],
    ['parts/engine/handles', 'handle'],
  ])
    for (const name of listed(path)) if (!findPage(`${kind}.${name}`)) missing.push(`${kind}.${name}`)
  for (const entry of listed('parts/cli/commands')) {
    const [folder, sub] = entry.split('/')
    const page = findPage(`command.${folder}`)
    if (!page) missing.push(`command.${folder}`)
    // The file of a folder that bears the folder's name is the command of that one word.
    else if (sub !== undefined && sub !== folder && !page.text.includes(`tent ${folder} ${sub}`))
      missing.push(`tent ${folder} ${sub} on command.${folder}`)
  }
  assert.deepEqual(missing, [])
})

test('[03-5] every word that tentjs, tentjs/ui, tentjs/cli and tentjs/test give has its page, as a word, a handle, a hook or a tag', () => {
  const entries: Record<string, string> = JSON.parse(textOf('parts/entries.json'))
  const missing: string[] = []
  for (const entry of ['tentjs', 'tentjs/ui', 'tentjs/cli', 'tentjs/test'])
    for (const [name, file] of valuesOf(entries[entry])) {
      // A class is a type that code meets, as `TentError` of `topic.errors`, and no word.
      if (new RegExp(`^export class ${name}\\b`, 'm').test(textOf(file))) continue
      if (!['word', 'handle', 'hook', 'tag'].some((kind) => findPage(`${kind}.${name}`)))
        missing.push(`${entry} ${name}`)
    }
  assert.deepEqual(missing, [], `no page for ${missing.join(', ')}`)
})

test('[03-5] every option that the type of a word states has its page, and the page of the word names it', () => {
  const words = thingsOf('Words', /^(\w+)[(:]/)
  assert.ok(words.size > 50, 'the words of the reference are read')
  const missing: string[] = []
  for (const [word, options] of words) {
    const own = findPage(`word.${word}`)?.text ?? ''
    for (const option of options) {
      if (!findPage(`option.${word}.${option}`)) missing.push(`option.${word}.${option}`)
      if (!own.includes(`\`option.${word}.${option}\``)) missing.push(`option.${word}.${option} on word.${word}`)
    }
  }
  assert.deepEqual(missing, [])
  // The options that every type takes, and a column, are those of one record that each type takes, so one page holds them.
  const shared = textOf('parts/core/type.ts').match(/interface (?:EveryOptions|ColumnOptions) \{[^}]*\}/g) ?? []
  assert.equal(shared.length, 2)
  const types = findPage('topic.types')?.text ?? ''
  for (const [, option] of shared.join('\n').matchAll(/^ {2}(\w+)\??:/gm))
    assert.ok(types.includes(`| \`${option}\` |`), `topic.types holds the option ${option} of every type`)
})

test('[03-5] an option that the type of a word states, with no page and no line of owed.json, fails the making of the reference, naming it', (t) => {
  const folder = mkdtempSync(join(tmpdir(), 'tent-reference-'))
  t.after(() => rmSync(folder, { recursive: true, force: true }))
  // The maker reads the docs, the entries and the parts that give a word, a hook, a tag and a command.
  for (const part of ['docs', 'core', 'screens', 'test', 'cli/commands', 'connect'])
    cpSync(join(root, 'parts', part), join(folder, 'parts', part), {
      recursive: true,
      filter: (path) => !/[\\/](?:tests|node_modules)$/.test(path),
    })
  cpSync(join(root, 'parts', 'entries.json'), join(folder, 'parts', 'entries.json'))
  const maker = join(root, 'scripts', 'reference.mjs')
  const make = () => spawnSync(process.execPath, [maker, folder], { encoding: 'utf8', maxBuffer: 1 << 24 })
  // With the page and its line there, the copy makes the reference of the tree.
  const whole = make()
  assert.equal(whole.status, 0, whole.stderr)
  assert.equal(whole.stdout, referenceText())
  const owed = join(folder, 'parts', 'docs', 'owed.json')
  const lines: string[] = JSON.parse(readFileSync(owed, 'utf8'))
  writeFileSync(
    owed,
    JSON.stringify(
      lines.filter((one) => one !== 'option.token.digits'),
      null,
      2,
    ),
  )
  rmSync(join(folder, 'parts', 'docs', 'pages', 'option.token.digits.md'))
  const made = make()
  assert.equal(made.status, 1, made.stdout.slice(0, 200))
  assert.match(made.stderr, /option\.token\.digits/)
})

test('[03-5] every property of a tag stands on the page of the tag', () => {
  const tags = thingsOf('Tags', /^<(\w+)>/)
  assert.equal(tags.size, listed('parts/screens/tags').length)
  const missing: string[] = []
  for (const [tag, properties] of tags) {
    const text = findPage(`tag.${tag}`)?.text ?? ''
    for (const property of properties) if (!text.includes(`\`${property}\``)) missing.push(`${tag} ${property}`)
  }
  assert.deepEqual(missing, [], `no page names ${missing.join(', ')}`)
})

test('[03-5] every flag of every command stands on the page of that command, as a flag or as the word it is typed in place of', () => {
  const missing: string[] = []
  const lines = partOf('Commands').filter((one) => one.startsWith('tent '))
  assert.ok(lines.length >= listed('parts/cli/commands').length)
  for (const line of lines) {
    const typed = line.replace(/ \/\/ .*$/, '')
    const name = typed.split(/ \[| --/)[0]
    const text = findPage(`command.${name.split(' ')[1]}`)?.text ?? ''
    // A word that is no flag fills a flag of one value: the lines of the page show a word in its place.
    const usage = text.split('\n').filter((one) => one === name || one.startsWith(`${name} `))
    const places = Math.max(
      0,
      ...usage.map(
        (one) =>
          (
            one
              .slice(name.length)
              .replace(/\[--[^\]]*\]/g, '')
              .replace(/--[\w-]+(?: <[^>]*>)?/g, '')
              .match(/\[[^\]]*\]|<[^>]*>/g) ?? []
          ).length,
      ),
    )
    let open = 0
    for (const [, flag, value, many] of typed.matchAll(/--([\w-]+)(?: <([^>]*)>( \.\.\.)?)?/g)) {
      if (text.includes(`--${flag}`) || text.includes(`<${flag}>`)) continue
      // A choice is typed as one of its values.
      if (value?.includes('|') && value.split('|').some((one) => text.includes(`${name} ${one}`))) continue
      if (value !== undefined && many === undefined && ++open <= places) continue
      missing.push(`${name} --${flag}`)
    }
  }
  assert.deepEqual(missing, [], `no page names ${missing.join(', ')}`)
})

test('[03-5] every adapter that a program or the engine.ts of a project fills has its page', () => {
  const makers = /export interface Makers \{([\s\S]*?)\n\}/.exec(textOf('parts/engine/makers.ts'))?.[1] ?? ''
  // Each entry makes its thing, or a list of them, or a record of them by name.
  const adapters = [...makers.matchAll(/^ {2}\w+\?: \([^)]*\) => (?:Record<string, (?:\([^)]*\) => )?)?(\w+)/gm)].map(
    (one) => one[1],
  )
  assert.ok(adapters.length >= 15, `the makers are read: ${adapters.join(', ')}`)
  const missing = adapters.filter((name) => !findPage(`adapter.${name}`))
  assert.deepEqual(missing, [], `no page for ${missing.join(', ')}`)
})

test('[03-5] every page that a page names is there', () => {
  const names = new Set(pageNames())
  const missing: string[] = []
  for (const page of names)
    for (const [, named] of (findPage(page)?.text ?? '').matchAll(
      /`((?:code|command|word|option|tag|hook|handle|adapter|topic)\.[\w.]+?)`/g,
    ))
      if (!names.has(named)) missing.push(`${named} on ${page}`)
  assert.deepEqual(missing, [])
})
