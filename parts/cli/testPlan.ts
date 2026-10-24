import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { TentError } from '../core/index.ts'
import type { Description } from '../core/internal.ts'
import { isStored } from '../core/internal.ts'

/** A text as a test file writes it: in single quotes. */
const quoted = (text: string): string => `'${text.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`

/** A step of the test that puts a value of its type into a field, or a comment where the type has no plain value. */
function filled(name: string, type: unknown): string {
  const kind = isStored(type) ? type.kind : undefined
  const at = quoted(name)
  if (kind === 'boolean') return `  await page.pick(${at}, true)`
  if (kind === 'choice' && isStored(type) && Array.isArray(type.of) && type.of.length)
    return `  await page.pick(${at}, ${quoted(String(type.of[0]))})`
  if (kind === 'number') return `  await page.type(${at}, '1')`
  if (kind === 'text') return `  await page.type(${at}, ${quoted(`A ${name}`)})`
  if (kind === 'day') return `  await page.type(${at}, '2031-01-01')`
  return `  // ${at}: a field of the kind ${String(kind)}, which the test gives a value to`
}

/**
 * The steps for each change and action that the screen and the components it draws call, as the build read them
 * from its source: each field of the input with a value of its type. The words of the press that sends it are the
 * view's, which the description does not hold: the step that presses it is left for the test to finish.
 */
function stepsOf(record: Record<string, unknown>, description: Description, lines: string[]): void {
  const uses = Array.isArray(record.uses) ? record.uses.map(String) : []
  const callers = [record, ...uses.map((name) => description.components[name])]
  const named = [...new Set(callers.flatMap((one) => (isStored(one) && Array.isArray(one.calls) ? one.calls : [])))]
  for (const name of named.map(String)) {
    if (!Object.hasOwn(description.functions, name)) continue
    const input: Record<string, unknown> = Object(Object(description.functions[name]).input)
    lines.push(`  // What calls ${name}: a form over its input, or a press.`)
    for (const [field, type] of Object.entries(input)) lines.push(filled(field, type))
    lines.push(`  // Press what sends it, by its words: await page.press('...')`)
  }
}

/** The values a row of `users` is added with, a value of its type for each column that needs one. */
function userOf(description: Description): string {
  const columns: Record<string, unknown> = Object(Object(description.tables.users).columns)
  const values = Object.entries(columns).flatMap(([name, type]) => {
    if (!isStored(type) || type.optional === true || type.default !== undefined) return []
    if (type.kind === 'list') return [`${name}: []`]
    if (type.kind === 'number') return [`${name}: 1`]
    if (type.kind === 'boolean') return [`${name}: false`]
    if (type.kind === 'text') return [`${name}: ${quoted(`A ${name}`)}`]
    return []
  })
  return `{ ${values.join(', ')} }`
}

/**
 * `tent test --plan <screen>`: takes the folder of a project, its description, and the name of a screen. Writes
 * `tests/<screen>.test.ts`, a first draft of a test for a person or a model to finish: it opens the screen as a test
 * user and fills each field of the input of each function it calls with a value of its type. It reads the
 * description alone. Answers the path of the file from the project. Throws T0001
 * for a name that is no screen, and T0013 where a file of that name is there already.
 */
export function plannedTest(folder: string, description: Description, screen: string): string {
  const record: unknown = Object.hasOwn(description.screens, screen) ? description.screens[screen] : undefined
  if (!isStored(record) || typeof record.path !== 'string')
    throw new TentError(
      'T0001',
      `No screen ${JSON.stringify(screen).slice(0, 80)} with an address is in the project.`,
      {
        fix: 'Name a screen by its name, as `tent map` lists it.',
      },
    )
  const file = `tests/${screen}.test.ts`
  if (existsSync(join(folder, file)))
    throw new TentError('T0013', `${file} is there already: a plan writes over no test.`, {
      fix: 'Move or remove that file, or finish the one that is there.',
    })
  const path = record.path.replace(/:([A-Za-z]+)/g, '$1')
  const access: unknown = Reflect.get(Object(record.access), 'rule')
  const users = Object.hasOwn(description.tables, 'users')
  const signed = access !== 'anyone' && users
  const steps: string[] = []
  stepsOf(record, description, steps)
  const lines = [
    "import test from 'node:test'",
    "import { testApp } from 'tentjs/test'",
    '',
    `// A first draft that \`tent test --plan ${screen}\` wrote from the description of the app: finish it.`,
    `test(${quoted(`the screen ${screen}`)}, async () => {`,
    '  const app = await testApp()',
    ...(signed ? [`  const user = await app.user(${userOf(description)})`] : []),
    ...(path !== record.path ? [`  // The address names a row: give it one that the test made.`] : []),
    `  const page = await app.open(${quoted(path)}${signed ? ', { as: user }' : ''})`,
    ...steps,
    '  await app.close()',
    '})',
    '',
  ]
  mkdirSync(join(folder, 'tests'), { recursive: true })
  writeFileSync(join(folder, file), lines.join('\n'))
  return file
}
