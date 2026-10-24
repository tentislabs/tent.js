import type { Node } from '../../build/index.ts'
import { child, keyOf, kid, kids, nameOf, scan, unwrap, walk } from '../../build/index.ts'
import type { Finding } from '../../core/index.ts'
import type { Rule, Written } from '../rule.ts'
import { at, writtenIn } from '../rule.ts'
import { statedAt } from '../stated.ts'
import { entriesOf, isView, literalOf, tagsOf } from '../tags.ts'

/** The kinds of address that `href` of `then` takes. */
const kinds = ['https', 'http', 'mailto', 'tel']

/** The kinds of address that `src` of an `Image` and an address of the head take. */
const loaded = ['https', 'http']

/** The kind that an address names before its colon, or nothing where it names none. */
const kindOf = (text: string): string | undefined => /^\s*([a-z][a-z0-9+.-]*):/i.exec(text)?.[1].toLowerCase()

/**
 * Whether a value that is worked out starts with a text of its own that starts with a path of the app: a template
 * whose first piece does, or a sum whose first part does.
 */
function startsWithPath(written: Node): boolean {
  const node = unwrap(written)
  if (node.type === 'TemplateLiteral') {
    const cooked: unknown = Reflect.get(kids(node, 'quasis')[0]?.value ?? {}, 'cooked')
    return typeof cooked === 'string' && cooked.startsWith('/')
  }
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    const left = kid(node, 'left')
    return left !== undefined && (startsWithPath(left) || textOf(left)?.startsWith('/') === true)
  }
  return false
}

/** The `href` of each `link` and the `src` of each `script` that a `head` writes in place, each with its node. */
function headAddresses(head: Node): [string, Node][] {
  const found: [string, Node][] = []
  walk(head, (node) => {
    const line = node.type === 'Property' ? keyOf(node) : undefined
    if (line !== 'link' && line !== 'script') return
    const address = (entriesOf(kid(node, 'value')) ?? []).find(([name]) => name === (line === 'link' ? 'href' : 'src'))
    if (address) found.push(address)
  })
  return found
}

/** Why a path leads out of the app, or nothing where it is a path of the app. */
function outOfTheApp(path: string): string | undefined {
  if (!path.startsWith('/')) return 'it does not start with one `/`'
  if (path.includes('//')) return 'it holds `//`, which a browser reads as another site'
  if (path.includes('\\')) return 'it holds a backslash, which a browser reads as a slash'
  if ([...path].some((sign) => sign.charCodeAt(0) < 32 || sign.charCodeAt(0) === 127))
    return 'it holds a control character'
  return undefined
}

/** Why a path written in place could lead out of the app, as it is written and with its percent signs read. */
function pathWrong(path: string): string | undefined {
  if (path.startsWith('#')) return undefined
  let read = path
  try {
    read = decodeURIComponent(path)
  } catch {
    read = path
  }
  const written = outOfTheApp(path)
  if (written) return written
  const decoded = read === path ? undefined : outOfTheApp(read)
  return decoded ? `${decoded} once its percent signs are read` : undefined
}

/** The text that a node holds where it is written in place, or nothing. */
function textOf(node: Node | undefined): string | undefined {
  const value = literalOf(node)
  return node && value.known && typeof value.value === 'string' ? value.value : undefined
}

const pathFix =
  'Name a screen, a path of the app that starts with one `/`, or `#<id>`. An address of another site is `href` of `then`.'

/** The literal paths that a view hands the arrow `useGoTo` answers: each with its node. */
function goneTo(view: Node, tree: Node): [string, Node][] {
  const local = scan(tree).imports.find((one) => one.from === 'tentjs/ui' && one.name === 'useGoTo')?.local
  if (local === undefined) return []
  const movers = new Set<string>()
  walk(view, (node) => {
    const init = kid(node, 'init')
    if (node.type === 'VariableDeclarator' && init && unwrap(init).type === 'CallExpression') {
      const callee = nameOf(unwrap(child(unwrap(init), 'callee')))
      const name = nameOf(kid(node, 'id'))
      if (callee === local && name !== undefined) movers.add(name)
    }
  })
  const found: [string, Node][] = []
  walk(view, (node) => {
    if (node.type !== 'CallExpression' || !movers.has(nameOf(unwrap(child(node, 'callee'))) ?? '')) return
    const first = kids(node, 'arguments')[0]
    const path = textOf(first)
    if (path !== undefined && first) found.push([path, first])
  })
  return found
}

/**
 * A literal address that is not allowed: a `to` of a `Link`, a path handed to `useGoTo` and a `goTo` of `then` that
 * could lead out of the app, an `href` of `then` of another kind than https, http, mailto and tel, and a `src` of an
 * `Image` and an address of the head of another kind than https and http. And an `href` of `then` that is worked
 * out from a text that starts with a path of the app, which is a move within it.
 */
export const rule: Rule = {
  code: 'T6013',
  needs: ['source'],
  reads: 'file',
  run: ({ source }) => {
    const found: Finding[] = []
    const path = (written: Written, node: Node | undefined, what: string, text: string): void => {
      const why = pathWrong(text)
      if (why)
        found.push(
          at(
            'T6013',
            written,
            node,
            `${what} names ${JSON.stringify(text)}: ${why}, so it could lead out of the app.`,
            pathFix,
          ),
        )
    }
    const kindWrong = (written: Written, node: Node, what: string, text: string): void => {
      const kind = kindOf(text)
      if (kind !== undefined && !loaded.includes(kind))
        found.push(
          at(
            'T6013',
            written,
            node,
            `${what} names an address of the kind \`${kind}\`, which is not loaded.`,
            'Give an asset, or an address that starts with https or http.',
          ),
        )
    }
    for (const tag of tagsOf(source)) {
      const src = tag.taken === 'Image' ? tag.props.get('src') : undefined
      const picture = textOf(src?.value)
      if (src && picture !== undefined) kindWrong(tag.written, src.node, '`src` of an `Image`', picture)
      if (tag.taken === 'Link') {
        const to = tag.props.get('to')
        const text = textOf(to?.value)
        if (text !== undefined) path(tag.written, to?.node, '`to`', text)
      }
      if (tag.taken !== 'Form') continue
      for (const [name, value] of entriesOf(tag.props.get('then')?.value) ?? []) {
        const text = textOf(value)
        if (name === 'href' && text === undefined && startsWithPath(value))
          found.push(
            at(
              'T6013',
              tag.written,
              value,
              '`href` of `then` is worked out from a text that starts with a path of the app, which is a move within it.',
              'Name the path of the app as `goTo`, with its values in `with`, and keep `href` for an address of another site.',
            ),
          )
        if (text === undefined) continue
        if (name === 'goTo') path(tag.written, value, '`goTo` of `then`', text)
        const kind = kindOf(text)
        if (name === 'href' && !kinds.includes(kind ?? ''))
          found.push(
            at(
              'T6013',
              tag.written,
              value,
              kind
                ? `\`href\` of \`then\` names an address of the kind \`${kind}\`, which a move does not take.`
                : `\`href\` of \`then\` names ${JSON.stringify(text)}, which is no address of another site.`,
              'Give an address that starts with https, http, mailto or tel, or a path of the app as `goTo`.',
            ),
          )
      }
    }
    for (const written of writtenIn(source)) {
      const head = written.word === 'screen' || written.word === 'project' ? statedAt(written, ['head']) : undefined
      for (const [name, node] of head ? headAddresses(head) : []) {
        const text = textOf(node)
        if (text !== undefined) kindWrong(written, node, `\`${name}\` of a line of the head`, text)
      }
      const tree = source[written.path].tree
      const view = isView(written) ? statedAt(written, ['view']) : undefined
      if (!tree || !view) continue
      for (const [text, node] of goneTo(view, tree)) path(written, node, 'A move of `useGoTo`', text)
    }
    return found
  },
}
