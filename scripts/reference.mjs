// Makes the reference of the docs, which `tent docs --reference` prints and which lies in the package as
// `parts/docs/reference.txt`: every word with its options, every hook, every tag with its properties, every
// command with its flags, and every code, each as its signature or its line, with the first sentence of its page.
// Every line is made from the types, the lists of the commands, tags and hooks, and the registry of the codes.
// Run: node scripts/reference.mjs [folder] [--without <page>]...      Prints the reference; `npm run lists` writes
// it. A page named after --without is taken as not written: the run ends with 1 where the reference needs it.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'oxc-parser'

const own = join(dirname(fileURLToPath(import.meta.url)), '..')

/** The text of a file, with the ends of its lines as one character. */
const textOf = (file) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n')

/** A text of code on one line: its runs of space as one space. */
const oneLine = (text) =>
  text
    // A comment in a type is no part of it; the members of a record on lines of their own are separated as on one.
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"])\/\/[^\n]*/g, '$1')
    .replace(/(=>|[^\s{([,;|&=:])[ \t]*\n\s*(?=[^\s})\]|&>])/g, (_, end) => (end === '=>' ? `${end} ` : `${end}; `))
    .replace(/\s+/g, ' ')
    .replace(/,\s*([)}\]>])/g, ' $1')
    .replace(/\(\s/g, '(')
    .replace(/\s\)/g, ')')
    .trim()

/**
 * What the reader holds of one file: its tree and its text, read once. The tree of a file that does not read is
 * nothing, and what it would have given is missed, which the run reports.
 */
function reader(folder) {
  const read = new Map()
  return (path) => {
    if (!read.has(path)) {
      const full = join(folder, path)
      if (!existsSync(full)) read.set(path, undefined)
      else {
        const text = textOf(full)
        const { program } = parseSync(path, text)
        read.set(path, { program, text, path })
      }
    }
    return read.get(path)
  }
}

/** The file that an import of a relative module names, from the file that imports it. */
function moduleOf(folder, from, source) {
  if (!source.startsWith('.')) return undefined
  const base = resolve(folder, dirname(from), source)
  const path = base.slice(resolve(folder).length + 1).replaceAll('\\', '/')
  for (const one of [path, `${path}.ts`, `${path}.tsx`]) if (existsSync(join(folder, one))) return one
  return undefined
}

/** The source text of a node of a file. */
const sliceOf = (file, node) => file.text.slice(node.start, node.end)

/** What a file exports, each name with the file and the name it comes from: its own, or one it hands on. */
function exportsOf(folder, read, path, seen = new Set()) {
  const found = new Map()
  const file = read(path)
  if (!file || seen.has(path)) return found
  seen.add(path)
  for (const node of file.program.body) {
    if (node.type !== 'ExportNamedDeclaration') continue
    if (node.source) {
      const from = moduleOf(folder, path, node.source.value)
      if (!from) continue
      for (const one of node.specifiers) found.set(one.exported.name, { path: from, name: one.local.name })
    } else if (node.declaration) {
      const declared = node.declaration
      const names =
        declared.type === 'VariableDeclaration'
          ? declared.declarations.map((one) => one.id.name)
          : declared.id
            ? [declared.id.name]
            : []
      for (const name of names) found.set(name, { path, name })
    }
  }
  return found
}

/** The file and the declaration of an exported name, followed through each file that hands it on. */
function declaredAt(folder, read, at, depth = 0) {
  const file = read(at.path)
  if (!file || depth > 6) return undefined
  const node = declarationOf(file, at.name)
  if (node) return { file, node }
  const next = exportsOf(folder, read, at.path).get(at.name)
  return next && next.path !== at.path ? declaredAt(folder, read, next, depth + 1) : undefined
}

/** The declaration of a name in a file: a function, a variable, an interface or a type, with what it was declared as. */
const declarationOf = (file, name) => declarationsOf(file, name)[0]

/** Every declaration of a name in a file, in their order: of a function with overloads, each of its signatures. */
function declarationsOf(file, name) {
  const found = []
  for (const top of file.program.body) {
    const node = top.type === 'ExportNamedDeclaration' && top.declaration ? top.declaration : top
    if ((node.type === 'FunctionDeclaration' || node.type === 'TSDeclareFunction') && node.id?.name === name)
      found.push(node)
    if (node.type === 'VariableDeclaration')
      for (const one of node.declarations) if (one.id.name === name) found.push(one)
    if ((node.type === 'TSInterfaceDeclaration' || node.type === 'TSTypeAliasDeclaration') && node.id.name === name)
      found.push(node)
  }
  return found
}

/** The file and the name that an imported name of a file comes from. */
function importOf(folder, file, name) {
  for (const node of file.program.body) {
    if (node.type !== 'ImportDeclaration') continue
    for (const one of node.specifiers ?? [])
      if (one.local.name === name) {
        const from = moduleOf(folder, file.path, node.source.value)
        if (from) return { path: from, name: one.imported?.name ?? name }
      }
  }
  return undefined
}

/** Finds a type by its name, in its file or where that file imports it from, and answers it with its file. */
function typeNamed(folder, read, file, name, depth = 0) {
  if (depth > 6) return undefined
  const own = declarationOf(file, name)
  if (own) return { file, node: own }
  const from = importOf(folder, file, name)
  const there = from && read(from.path)
  if (!there) return undefined
  const exported = exportsOf(folder, read, from.path).get(from.name)
  const next = exported ? read(exported.path) : there
  return next ? typeNamed(folder, read, next, exported?.name ?? from.name, depth + 1) : undefined
}

/** What the type parameters of a declaration stand for: each by its constraint, its default, or `unknown`. */
function standsFor(file, node) {
  const params = node?.typeParameters?.params ?? []
  return new Map(
    params.map((one) => [
      one.name.name,
      one.constraint
        ? oneLine(sliceOf(file, one.constraint))
        : one.default
          ? oneLine(sliceOf(file, one.default))
          : 'unknown',
    ]),
  )
}

/** A type as it is written, with each type parameter put as what it stands for. */
function typeText(file, node, params) {
  let text = oneLine(sliceOf(file, node))
  for (const [name, stands] of params) text = text.replace(new RegExp(`\\b${name}\\b`, 'g'), stands)
  return bare(text)
}

/**
 * A text of types with the arguments of a type left out where they say nothing more: where every one is
 * `unknown`, and of the type of the options of a word, whose options stand under it one by one.
 */
function bare(text) {
  // A record that only refuses the names its type does not hold says nothing more either.
  let out = text
    .replace(/<unknown(?:, unknown)*>/g, '')
    .replace(/\bOnly<(\w+), \1>/g, '$1')
    .replace(/ & \{ \[\w+ in Exclude<[^\]]*\]: never \}/g, '')
  for (let at = out.search(/\w+Options</); at >= 0; at = out.search(/\w+Options</)) {
    const open = out.indexOf('<', at)
    let depth = 0
    let end = open
    for (; end < out.length; end++) {
      if (out[end] === '<') depth++
      if (out[end] === '>' && --depth === 0) break
    }
    out = out.slice(0, open) + out.slice(end + 1)
  }
  return out
}

/**
 * The members of a type, each with its name, whether it may be left out, and its type: of an interface with what
 * it extends, of a record written in place, and of `Omit` and `Partial` of one. Nothing for any other type.
 */
function membersOf(folder, read, file, node, params, depth = 0) {
  if (!node || depth > 8) return []
  if (node.type === 'TSTypeAnnotation') return membersOf(folder, read, file, node.typeAnnotation, params, depth)
  if (node.type === 'TSTypeLiteral' || node.type === 'TSInterfaceBody') {
    const list = node.type === 'TSTypeLiteral' ? node.members : node.body
    return list
      .filter((one) => one.type === 'TSPropertySignature' && one.key)
      .map((one) => ({
        name: one.key.name ?? one.key.value,
        optional: one.optional === true,
        type: one.typeAnnotation ? typeText(file, one.typeAnnotation.typeAnnotation, params) : 'unknown',
      }))
  }
  if (node.type === 'TSInterfaceDeclaration') {
    const inner = new Map([...params, ...standsFor(file, node)])
    const own = membersOf(folder, read, file, node.body, inner, depth + 1)
    // What an interface takes from another is marked with the name it was taken by, so a list can name it once.
    const extended = (node.extends ?? []).flatMap((one) =>
      membersOf(
        folder,
        read,
        file,
        { type: 'TSTypeReference', typeName: one.expression, typeArguments: one.typeArguments },
        inner,
        depth + 1,
      ).map((member) => ({
        ...member,
        via: baseOf(file, one),
        written: oneLine(sliceOf(file, one)).replace(/^(?!Omit<)(\w+)<.*>$/, '$1'),
      })),
    )
    return [...own, ...extended.filter((one) => !own.some((mine) => mine.name === one.name))]
  }
  if (node.type === 'TSTypeAliasDeclaration')
    return membersOf(folder, read, file, node.typeAnnotation, new Map([...params, ...standsFor(file, node)]), depth + 1)
  if (node.type === 'TSIntersectionType')
    return node.types.flatMap((one) => membersOf(folder, read, file, one, params, depth + 1))
  if (node.type === 'TSTypeReference' && node.typeName?.type === 'Identifier') {
    // A type parameter is read as the type it is held to.
    const stands = params.get(node.typeName.name)
    const name = stands && /^\w+$/.test(stands) ? stands : node.typeName.name
    const args = node.typeArguments?.params ?? []
    if ((name === 'Omit' || name === 'Partial' || name === 'Readonly') && args[0]) {
      const inner = membersOf(folder, read, file, args[0], params, depth + 1)
      if (name !== 'Omit') return inner.map((one) => ({ ...one, optional: one.optional || name === 'Partial' }))
      const gone = new Set(
        oneLine(sliceOf(file, args[1] ?? args[0]))
          .match(/'[^']+'/g)
          ?.map((one) => one.slice(1, -1)),
      )
      return inner.filter((one) => !gone.has(one.name))
    }
    const found = typeNamed(folder, read, file, name)
    const members = found ? membersOf(folder, read, found.file, found.node, params, depth + 1) : []
    // A type made of another by a helper of its own, as `Only<TextOptions, ...>`, holds the members of that one.
    return members.length || !args[0] ? members : membersOf(folder, read, file, args[0], params, depth + 1)
  }
  return []
}

/** The name of the type that an interface takes members from: of `Omit<Box, 'label'>` it is `Box`. */
function baseOf(file, one) {
  const written = oneLine(sliceOf(file, one))
  return /^(?:Omit|Partial|Readonly)<\s*(\w+)/.exec(written)?.[1] ?? written.replace(/<.*$/, '')
}

/**
 * The function that a declaration of a word gives. A word that carries members of its own, made as
 * `Object.assign(fn, { ... })`, is called as its function.
 */
function functionOf(node) {
  const init = node.type === 'VariableDeclarator' ? node.init : node
  const { callee } = init?.type === 'CallExpression' ? init : {}
  const assigned =
    callee?.type === 'MemberExpression' && callee.object?.name === 'Object' && callee.property?.name === 'assign'
  return assigned ? init.arguments[0] : init
}

/** The signature of a function as it is written: its parameters with their types, and what it answers. */
function signatureOf(file, node, name, answers = true) {
  const fn = functionOf(node)
  const params = standsFor(file, fn)
  if (node.type === 'VariableDeclarator' && node.id.typeAnnotation)
    return `${name}: ${typeText(file, node.id.typeAnnotation.typeAnnotation, params)}`
  if (!fn?.params) return name
  const list = (fn.params.items ?? fn.params).map((one) => {
    const target = one.type === 'TSParameterProperty' ? one.parameter : one
    const left = target.type === 'AssignmentPattern' ? target.left : target
    const named =
      left.type === 'Identifier' ? left.name : left.type === 'RestElement' ? `...${left.argument.name}` : 'o'
    const annotation = left.typeAnnotation ?? target.typeAnnotation
    const optional = left.optional || target.type === 'AssignmentPattern' ? '?' : ''
    return annotation ? `${named}${optional}: ${typeText(file, annotation.typeAnnotation, params)}` : named
  })
  const rest = fn.params.rest
  if (rest)
    list.push(
      `...${rest.argument.name}${rest.typeAnnotation ? `: ${typeText(file, rest.typeAnnotation.typeAnnotation, params)}` : ''}`,
    )
  const answer = answers && fn.returnType ? `: ${typeText(file, fn.returnType.typeAnnotation, params)}` : ''
  return `${name}(${list.join(', ')})${answer}`
}

/** The options of a word: the members of the type of its last parameter that is a record. */
function optionsOf(folder, read, file, node) {
  const fn = functionOf(node)
  const params = [...((fn?.params?.items ?? fn?.params) || [])].reverse()
  for (const one of params) {
    const target = one.type === 'AssignmentPattern' ? one.left : one
    const annotation = target.typeAnnotation
    if (!annotation) continue
    const members = membersOf(folder, read, file, annotation.typeAnnotation, standsFor(file, fn))
    if (members.length) return members
  }
  return []
}

/**
 * The options of a word: the members of the type of its parameter `o` or `options`, its record of options, in
 * each of its signatures, the first one's first. A member of the record of another parameter, as the event that
 * `emit` is handed, is no option.
 */
function wordOptionsOf(folder, read, file, node) {
  const name = node.id?.name
  const signatures = name ? declarationsOf(file, name) : [node]
  const found = new Map()
  for (const signature of signatures) {
    const fn = functionOf(signature)
    for (const one of (fn?.params?.items ?? fn?.params) || []) {
      const target = one.type === 'AssignmentPattern' ? one.left : one
      if (target.type !== 'Identifier' || !['o', 'options'].includes(target.name) || !target.typeAnnotation) continue
      for (const member of membersOf(folder, read, file, target.typeAnnotation.typeAnnotation, standsFor(file, fn)))
        if (!found.has(member.name)) found.set(member.name, member)
    }
  }
  return [...found.values()]
}

/** The first sentence of the text under the title of a page, up to where it begins to tell more. */
function firstOf(folder, page) {
  const lines = textOf(join(folder, 'parts/docs/pages', `${page}.md`)).split('\n')
  const first = lines.slice(1).find((line) => line.trim() !== '') ?? ''
  const [sentence] = first.split(/(?<=[.!?])\s+(?=[A-Z`])/)
  // The sentence up to its first colon or semicolon outside code says the rule; what follows tells it more.
  const head = /^((?:[^`:;]|`[^`]*`)*?)[:;]\s/.exec(sentence)?.[1]
  // What stands between two dashes tells more, and is left out.
  const said = (head ? `${head.trim()}.` : sentence).replace(/ - [^-]+ - /g, ' ').trim()
  // A long one ends at the last pause before its seventieth character, so that the reference stays small.
  if (said.length <= 70) return said
  const pause = said.slice(0, 70).search(/,[^,]*$/)
  return pause > 30 ? `${said.slice(0, pause)}.` : said
}

/** The names of the entries of a made list, as `name: '...'` writes them, but a folder's second word. */
const listedIn = (folder, path) =>
  [...textOf(join(folder, path, 'list.ts')).matchAll(/name: '([^']+)'/g)].map((one) => one[1])

/** A flag of a command, as it is typed, from the type its `args` gives it. */
function flagOf(file, property) {
  const name = property.key.name ?? property.key.value
  const text = oneLine(sliceOf(file, property.value))
  const optional = /optional: true/.test(text) || /^boolean\(/.test(text)
  const kind = (/^(\w+)\(/.exec(text)?.[1] ?? 'text').replace(/^list$/, 'many')
  // A choice is typed as one of its values, which stand in its place.
  const values = /^choice\(\[([^\]]*)\]/
    .exec(text)?.[1]
    .match(/'[^']*'/g)
    ?.map((one) => one.slice(1, -1))
  const value =
    kind === 'boolean'
      ? `--${name}`
      : kind === 'many'
        ? `--${name} <${/^list\((\w+)\(/.exec(text)?.[1] ?? 'text'}> ...`
        : `--${name} <${values?.length ? values.join('|') : kind}>`
  return optional ? `[${value}]` : value
}

/** The line of a command: `tent`, its words, and each flag its `args` states. */
function commandLine(folder, read, entry) {
  const path = existsSync(join(folder, 'parts/cli/commands', `${entry}.ts`))
    ? `parts/cli/commands/${entry}.ts`
    : `parts/cli/commands/${entry}/index.ts`
  const file = read(path)
  const declared = file && declarationOf(file, 'command')
  const record = declared?.init?.type === 'ObjectExpression' ? declared.init : undefined
  const property = (key) => record?.properties.find((one) => (one.key?.name ?? one.key?.value) === key)
  const name = property('name')?.value?.value ?? entry.replace('/', ' ')
  const args = property('args')?.value
  // `--data`, by which a command finds its engine, is said once for all of them.
  const flags =
    args?.type === 'ObjectExpression'
      ? args.properties
          .filter((one) => one.key)
          .map((one) => flagOf(file, one))
          .filter((one) => one !== '[--data <text>]')
      : []
  return { name, line: ['tent', name, ...flags].join(' ') }
}

/** Every code that the code of the framework names, but in the registry itself and in tests. */
function namedCodes(folder, path = 'parts', found = new Set()) {
  for (const entry of readdirSync(join(folder, path), { withFileTypes: true })) {
    const below = `${path}/${entry.name}`
    if (entry.isDirectory()) {
      if (entry.name !== 'tests' && entry.name !== 'node_modules' && !entry.name.startsWith('.'))
        namedCodes(folder, below, found)
    } else if (/\.tsx?$/.test(entry.name) && below !== 'parts/core/codes.ts')
      for (const [code] of textOf(join(folder, below)).matchAll(/\bT\d{4}\b/g)) found.add(code)
  }
  return found
}

/** The codes of the registry, each with its short word, in their order. */
function codesOf(read) {
  const file = read('parts/core/codes.ts')
  const names = file && declarationOf(file, 'codeNames')
  const record =
    names?.init?.type === 'TSAsExpression' || names?.init?.type === 'TSSatisfiesExpression'
      ? names.init.expression
      : names?.init
  return (record?.properties ?? []).map((one) => ({ code: one.key.name ?? one.key.value, word: one.value.value }))
}

/**
 * Takes the root of a tree of the framework, and the names of pages to take as not written. Answers the text of
 * the reference. Throws, naming each, where a thing it names has no page, or where a word cannot be found among
 * the entries.
 */
export function referenceOf(folder = own, o = { without: [] }) {
  const read = reader(folder)
  const pages = new Set(
    readdirSync(join(folder, 'parts/docs/pages'))
      .filter((one) => one.endsWith('.md'))
      .map((one) => one.replace(/\.md$/, ''))
      .filter((one) => !o.without.includes(one)),
  )
  const missed = []
  const comment = (page) => {
    if (!pages.has(page)) {
      missed.push(page)
      return ''
    }
    return ` // ${firstOf(folder, page)}`
  }
  const owed = JSON.parse(textOf(join(folder, 'parts/docs/owed.json')))
  const entries = JSON.parse(textOf(join(folder, 'parts/entries.json')))
  const givers = ['tentjs', 'tentjs/ui', 'tentjs/test'].map((entry) => exportsOf(folder, read, entries[entry]))
  const exported = new Map(givers.flatMap((one) => [...one]))
  const out = [
    '# The reference of Tent.js',
    '',
    'Every word with its options, every hook, every tag with its properties, every command with its flags, and every code.',
    'Each line is made from the types and lists of this version, with the first sentence of its page, which `tent docs <name>` prints.',
    '',
    '## Words',
    '',
  ]
  const owedOptions = new Map()
  const optionLines = new Set()
  for (const line of owed) {
    const found = /^option\.([^.]+)\.(.+)$/.exec(line)
    if (found) owedOptions.set(found[1], [...(owedOptions.get(found[1]) ?? []), found[2]])
  }
  for (const word of owed.filter((one) => one.startsWith('word.')).map((one) => one.slice(5))) {
    const at = exported.get(word)
    const { file, node } = (at && declaredAt(folder, read, at)) ?? {}
    if (!node) {
      missed.push(`word.${word} (no declaration among the entries)`)
      continue
    }
    out.push(`${signatureOf(file, node, word, false)}${comment(`word.${word}`)}`)
    // The options are those the docs owe a page and those its type states, each with the type the word gives it,
    // in every entry that gives it: a value word of a view takes fewer than the one it is made from.
    // What a type takes from a record that every type takes is said once, on the page of the types.
    const typed = [
      ...new Map(
        givers
          .map((one) => one.get(word))
          .map((one) => one && declaredAt(folder, read, one))
          .flatMap((one) => (one ? wordOptionsOf(folder, read, one.file, one.node) : []))
          .reverse()
          .map((one) => [one.name, one]),
      ).values(),
    ]
    const named = new Set([...(owedOptions.get(word) ?? []), ...typed.filter((one) => !one.via).map((one) => one.name)])
    for (const name of [...named].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
      const member = typed.find((one) => one.name === name)
      const shown = member ? `${name}${member.optional ? '?' : ''}: ${member.type}` : name
      // An option that another word gave before with its type and its sentence is said once, as get and post give
      // the options of a call: its line stands under each, its sentence at the first.
      const line = `  ${shown}${comment(`option.${word}.${name}`)}`
      out.push(optionLines.has(line) ? `  ${shown}` : line)
      optionLines.add(line)
    }
  }
  out.push('', '## Hooks', '')
  for (const hook of listedIn(folder, 'parts/screens/hooks')) {
    const file = read(`parts/screens/hooks/${hook}.ts`)
    const node = file && declarationOf(file, hook)
    out.push(`${node ? signatureOf(file, node, hook) : hook}${comment(`hook.${hook}`)}`)
  }
  out.push('', '## Tags', '')
  for (const tag of listedIn(folder, 'parts/screens/tags')) {
    const file = read(`parts/screens/tags/${tag}.tsx`)
    const node = file && declarationOf(file, tag)
    const props = node && file ? optionsOf(folder, read, file, node) : []
    out.push(`<${tag}>${comment(`tag.${tag}`)}`)
    for (const prop of props) out.push(`  ${prop.name}${prop.optional ? '?' : ''}: ${prop.type}`)
  }
  out.push(
    '',
    '## Commands',
    '',
    'A command that reaches the engine of an app also takes `[--data <folder>]`, and every command `[--json]`.',
    '`tent --version`, or `tent -v`, prints the version of the tentjs that runs.',
    '',
  )
  const said = new Set()
  for (const entry of listedIn(folder, 'parts/cli/commands')) {
    const { name, line } = commandLine(folder, read, entry)
    // A command that is a file of a folder has the one page of its folder, whose sentence is said once.
    const page = `command.${name.split(' ')[0]}`
    out.push(`${line}${said.has(page) ? '' : comment(page)}`)
    said.add(page)
  }
  out.push('', '## Codes', '')
  // A code that the registry holds and nothing of the framework names yet belongs to a step still to come.
  const named = namedCodes(folder)
  for (const { code, word } of codesOf(read))
    if (named.has(code) || pages.has(`code.${code}`)) out.push(`${code} ${word}${comment(`code.${code}`)}`)
  if (missed.length) throw new Error(`The reference names things that have no page: ${missed.join(', ')}.`)
  return `${out.join('\n')}\n`
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const words = process.argv.slice(2)
  const without = words.flatMap((word, at) => (words[at - 1] === '--without' ? [word] : []))
  const folder = words.find((word, at) => !word.startsWith('--') && words[at - 1] !== '--without') ?? own
  try {
    process.stdout.write(referenceOf(folder, { without }))
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
