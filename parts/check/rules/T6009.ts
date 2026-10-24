import type { Node, Source } from '../../build/index.ts'
import { kid, kids, nameOf, scan, walk } from '../../build/index.ts'
import type { Finding } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import { stateEntries, isStored } from '../../core/internal.ts'
import { definitionAt, definitionNamed, importedFrom } from '../named.ts'
import type { Rule, Written } from '../rule.ts'
import { at, writtenIn } from '../rule.ts'
import { statedAt } from '../stated.ts'
import type { Tag } from '../tags.ts'
import { entriesOf, literalOf, tagsOf } from '../tags.ts'

type Stored = Record<string, unknown>

/** The type of the field that a dotted name reaches in an input, or nothing where it reaches none. */
function reached(input: Stored, name: string): Stored | undefined {
  let fields: unknown = input
  let type: Stored | undefined
  for (const part of name.split('.')) {
    if (!isStored(fields) || !Object.hasOwn(fields, part) || !isStored(fields[part])) return undefined
    type = fields[part]
    fields = type.kind === 'object' ? type.shape : undefined
  }
  return type
}

/** The text of a property, where it is written in place. */
const textOf = (tag: Tag, name: string): string | undefined => {
  const value = tag.props.get(name)?.literal
  return value?.known && typeof value.value === 'string' ? value.value : undefined
}

/** The input of the function that a form calls, as the description holds it, where the form names one function. */
function inputOf(description: Description, called: string | undefined): Stored | undefined {
  const stored =
    called !== undefined && Object.hasOwn(description.functions, called) ? description.functions[called] : undefined
  return stored ? (isStored(stored.input) ? stored.input : {}) : undefined
}

/** The form that a tag stands in: the nearest one around it. */
const formOf = (tag: Tag): Tag | undefined => tag.around.findLast((one) => one.taken === 'Form')

/** The texts of a property that is a list written in place. */
function listOf(tag: Tag, name: string): string[] {
  const value = tag.props.get(name)?.literal
  return value?.known && Array.isArray(value.value) ? value.value.filter((one) => typeof one === 'string') : []
}

/** A name handed to `useField` in place, with where it is written. */
interface FieldNamed {
  name: string
  node: Node
  path: string
}

/** Each name that a function hands to `useField` in place, as the file that holds the function takes the hook. */
function fieldsNamedIn(source: Source, path: string, body: Node): FieldNamed[] {
  const tree = source[path]?.tree
  if (!tree) return []
  const hook = new Set(
    scan(tree)
      .imports.filter((one) => one.from === 'tentjs/ui' && one.name === 'useField')
      .map((one) => one.local),
  )
  const found: FieldNamed[] = []
  walk(body, (node) => {
    const callee = node.type === 'CallExpression' ? nameOf(kid(node, 'callee')) : undefined
    if (callee === undefined || !hook.has(callee)) return
    const [first] = kids(node, 'arguments')
    const name = first ? literalOf(first) : undefined
    if (first && name?.known && typeof name.value === 'string') found.push({ name: name.value, node: first, path })
  })
  return found
}

/**
 * The function that a tag of a view names, as its file writes it: the view of a component, a function that the
 * file declares, or one that it imports from a file of the project. Nothing for a tag of any other name.
 */
function drawnBy(
  source: Source,
  path: string,
  name: string,
  depth = 0,
): { path: string; body: Node; written?: Written } | undefined {
  const defined = definitionNamed(source, path, name)
  if (defined?.word === 'component') {
    const view = statedAt(defined, ['view'])
    return view ? { path: defined.path, body: view, written: defined } : undefined
  }
  const tree = source[path]?.tree
  if (!tree || depth > 8) return undefined
  let body: Node | undefined
  walk(tree, (node) => {
    if (body !== undefined || nameOf(kid(node, 'id')) !== name) return
    if (node.type === 'FunctionDeclaration') body = node
    const made = node.type === 'VariableDeclarator' ? kid(node, 'init') : undefined
    if (made && (made.type === 'ArrowFunctionExpression' || made.type === 'FunctionExpression')) body = made
  })
  if (body) return { path, body }
  const from = importedFrom(source, path, name)
  return from && drawnBy(source, from.path, from.name, depth + 1)
}

/** What a screen takes in `with` of a `Link` to it: the values of its address, and the state it keeps there. */
function takesOf(screen: Stored): string[] {
  const path = typeof screen.path === 'string' ? screen.path : ''
  const params = [...path.matchAll(/:([A-Za-z][A-Za-z0-9]*)/g)].map((one) => one[1])
  const kept = Object.entries(stateEntries(screen.state))
    .filter(([, entry]) => entry.in === 'address')
    .map(([name]) => name)
  return [...params, ...kept]
}

/**
 * A `name` written in place on a control inside a `Form` that the form's function does not take, and one that
 * `with` of the form gives too; a name in `values` or in `reset` that is no field of it; and a value in `with` of a
 * `Link` that the screen it goes to does not take.
 */
export const rule: Rule = {
  code: 'T6009',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    const tags = tagsOf(source)
    for (const form of tags.filter((one) => one.taken === 'Form')) {
      const called = definitionAt(source, form.written.path, form.props.get('call')?.value)
      const input = inputOf(description, called?.name)
      if (!called || !input) continue
      // The fields are named in the order the function declares them, which is the order a builder knows.
      const declared = entriesOf(statedAt(called, ['input']))?.map(([name]) => name) ?? Object.keys(input)
      const takes = declared.join(', ') || 'no field'
      const say = (written: Written, node: Node, message: string): void =>
        void found.push(
          at('T6009', written, node, message, `Name a field of the input of \`${called.name}\`: ${takes}.`),
        )
      const given = (entriesOf(form.props.get('with')?.value) ?? []).map(([name]) => name)
      for (const [option, names] of [
        ['values', (entriesOf(form.props.get('values')?.value) ?? []).map(([name]) => name)],
        ['reset', listOf(form, 'reset')],
      ] as const)
        for (const name of names)
          if (!reached(input, name))
            say(
              form.written,
              form.props.get(option)?.node ?? form.node,
              `\`${option}\` names \`${name}\`, which is no field of the input: it takes ${takes}.`,
            )
      // A control of the form is any tag inside it with a `name` written in place, a native one and a library's.
      for (const control of tags.filter((one) => one.taken === undefined && formOf(one) === form)) {
        // A component or a function drawn inside the form is a field of it where it hands `useField` a name.
        const drawn = /^[A-Z]/.test(control.name) ? drawnBy(source, control.written.path, control.name) : undefined
        for (const field of drawn ? fieldsNamedIn(source, drawn.path, drawn.body) : []) {
          if (reached(input, field.name)) continue
          const message = `\`useField\` is handed \`${field.name}\`, which is no field of the input: it takes ${takes}.`
          // A finding is told by the definition that holds its line: the component, or the view the function stands
          // beside. Where the function's file holds no definition, its use inside the form is named.
          const holder =
            drawn?.written ??
            (field.path === control.written.path
              ? control.written
              : writtenIn(source).find((one) => one.path === field.path))
          if (holder) say(holder, field.node, message)
          else say(control.written, control.node, `\`${control.name}\`: ${message}`)
        }
        const name = textOf(control, 'name')
        const node = control.props.get('name')?.node
        if (name === undefined || node === undefined) continue
        if (!reached(input, name))
          say(control.written, node, `\`${name}\` is no field of the input, which takes ${takes}.`)
        else if (given.includes(name))
          say(control.written, node, `\`${name}\` is given by this control and by \`with\` of its form.`)
      }
    }
    for (const link of tags.filter((one) => one.taken === 'Link')) {
      const to = definitionAt(source, link.written.path, link.props.get('to')?.value)
      const screen =
        to?.word === 'screen' && Object.hasOwn(description.screens, to.name) ? description.screens[to.name] : undefined
      const given = entriesOf(link.props.get('with')?.value)
      if (!to || !screen || !given) continue
      const takes = takesOf(screen)
      for (const [name] of given)
        if (!takes.includes(name))
          found.push(
            at(
              'T6009',
              link.written,
              link.props.get('with')?.node,
              `\`with\` gives \`${name}\`, which the screen \`${to.name}\` does not take: it takes ${takes.map((one) => `\`${one}\``).join(', ') || 'nothing'}.`,
              'Give a value of its address, or of the state it keeps in the address.',
            ),
          )
    }
    return found
  },
}
