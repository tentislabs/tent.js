import type { Node } from '../tree.ts'
import { child, cooked, keyOf, kid, kids, nameOf, unwrap, word } from '../tree.ts'
import { access } from './access.ts'
import type { Reach } from './reach.ts'
import { NotPlain } from './reach.ts'

const signs = new Set(['==', '!=', '===', '!==', '<', '<=', '>', '>=', '+', '-', '*', '/', '%', '&&', '||', '??'])

function literal(node: Node): unknown {
  if (node.regex !== undefined) throw new NotPlain('a regular expression', node)
  if (node.bigint !== undefined) throw new NotPlain('a number too large for a plain number', node)
  const value = node.value
  if (typeof value === 'number' && !Number.isFinite(value))
    throw new NotPlain('a number that the stored bytes cannot hold', node)
  return value
}

function textWithValues(node: Node, reach: Reach): unknown {
  const values = kids(node, 'expressions')
  const parts: unknown[] = []
  for (const [i, piece] of kids(node, 'quasis').entries()) {
    const written = cooked(piece)
    if (written) parts.push(written)
    if (i < values.length) parts.push(value(values[i], reach))
  }
  return { text: parts.length ? parts : [''] }
}

function objectWritten(node: Node, reach: Reach): unknown {
  const object: [string, unknown][] = []
  for (const property of kids(node, 'properties')) {
    if (property.type !== 'Property') throw new NotPlain('a spread', property)
    if (property.computed === true) throw new NotPlain('a key that is worked out', property)
    if (property.method === true || property.kind !== 'init')
      throw new NotPlain('a function other than an arrow', property)
    const key = keyOf(property)
    if (key === undefined) throw new NotPlain('a key that is worked out', property)
    // A key stands once in the stored form, so an object that writes one key twice cannot be stored.
    if (object.some((entry) => entry[0] === key))
      throw new NotPlain(`an object that writes the key "${key}" twice`, property)
    object.push([key, value(child(property, 'value'), reach)])
  }
  return { object }
}

function listWritten(node: Node, reach: Reach): unknown {
  const elements = Array.isArray(node.elements) ? node.elements : []
  const entries = kids(node, 'elements')
  if (entries.length !== elements.length) throw new NotPlain('a list with a gap', node)
  return entries.map((entry) => {
    if (entry.type === 'SpreadElement') throw new NotPlain('a spread', entry)
    return value(entry, reach)
  })
}

/** Takes one value of the tree and the names in reach. Answers its stored form. Throws `NotPlain` where the value makes its arrow code. */
export function value(node: Node, reach: Reach): unknown {
  const n = unwrap(node)
  const sign = word(n, 'operator') ?? ''
  switch (n.type) {
    case 'Literal':
      return literal(n)
    case 'TemplateLiteral':
      return textWithValues(n, reach)
    case 'ArrayExpression':
      return listWritten(n, reach)
    case 'ObjectExpression':
      return objectWritten(n, reach)
    case 'Identifier':
      return nameOf(n) === 'undefined' ? { nothing: true } : access(n, reach)
    case 'MemberExpression':
    case 'ChainExpression':
    case 'CallExpression':
      return access(n, reach)
    case 'UnaryExpression':
      if (sign === '!') return { not: value(child(n, 'argument'), reach) }
      if (sign === '-') return { minus: value(child(n, 'argument'), reach) }
      throw new NotPlain(sign === 'typeof' ? '`typeof`' : `the sign \`${sign}\` in front of a value`, n)
    case 'BinaryExpression':
    case 'LogicalExpression':
      if (!signs.has(sign)) throw new NotPlain(`the sign \`${sign}\``, n)
      return { op: sign, left: value(child(n, 'left'), reach), right: value(child(n, 'right'), reach) }
    case 'ConditionalExpression':
      return {
        if: value(child(n, 'test'), reach),
        then: value(child(n, 'consequent'), reach),
        else: value(child(n, 'alternate'), reach),
      }
    case 'AwaitExpression':
      if (reach.screen) throw new NotPlain('`await`, which an arrow of a screen does not hold', n)
      return { await: value(child(n, 'argument'), reach) }
    case 'NewExpression':
      throw new NotPlain('`new`', n)
    case 'ArrowFunctionExpression':
      throw new NotPlain('an arrow that is not handed to a word which takes one', n)
    case 'FunctionExpression':
      throw new NotPlain('a function other than an arrow', n)
    case 'AssignmentExpression':
    case 'UpdateExpression':
      throw new NotPlain('a second value for a name', n)
    case 'TaggedTemplateExpression':
      throw new NotPlain(
        word(kid(unwrap(child(n, 'tag')), 'property'), 'name') === 'sql'
          ? '`db.sql` or `db.n`'
          : 'a call of what is no word of ours: a tag in front of a text',
        n,
      )
    default:
      throw new NotPlain(`a form that a body does not hold (${n.type})`, n)
  }
}
