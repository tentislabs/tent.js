import type { Node } from '../tree.ts'
import { child, kid, kids, nameOf, unwrap, word } from '../tree.ts'
import type { Reach } from './reach.ts'
import { endsAChain, inBlock, NotPlain } from './reach.ts'
import { value } from './value.ts'
import { isStored } from '../../core/internal.ts'

const typesOnly = new Set(['TSTypeAliasDeclaration', 'TSInterfaceDeclaration', 'EmptyStatement'])

/** The words of each statement that makes a body code. */
const refused: Record<string, string> = {
  WhileStatement: '`while`',
  DoWhileStatement: '`while`',
  ForStatement: 'a repeat that is not `for (const name of list)`',
  ForInStatement: 'a repeat that is not `for (const name of list)`',
  SwitchStatement: '`switch`',
  TryStatement: '`try`',
  ThrowStatement: '`throw`',
  FunctionDeclaration: 'a function other than an arrow',
  ClassDeclaration: 'a class',
}

// A chain may go on from a name whose `const` holds a chain through `db` that has not ended, a plan made from an
// imported table, which no member ends, or a choice between such. Answers 'db', 'table' or nothing.
function chainOf(stored: unknown, reach: Reach): false | 'db' | 'table' {
  if (!isStored(stored)) return false
  if (isStored(stored.plan)) {
    const plan = stored.plan
    if ('table' in plan) return 'table'
    const from = Array.isArray(plan.name) ? String(plan.name[0]) : undefined
    if (from !== undefined && reach.scopes.some((names) => names.get(from)?.chain === 'table')) return 'table'
    const steps = Array.isArray(stored.then) ? stored.then : []
    return steps.some((step) => isStored(step) && Object.keys(step).some((member) => endsAChain.has(member)))
      ? false
      : 'db'
  }
  if (!('if' in stored)) return false
  const then = chainOf(stored.then, reach)
  return then && then === chainOf(stored.else, reach) ? then : false
}

/** The names that an object pattern takes, where it takes a record apart by its own names alone. */
export function ownNames(pattern: Node | undefined): string[] | undefined {
  if (pattern?.type !== 'ObjectPattern') return undefined
  const names: string[] = []
  for (const property of kids(pattern, 'properties')) {
    const name =
      property.type === 'Property' && property.shorthand === true ? nameOf(kid(property, 'value')) : undefined
    if (name === undefined) return undefined
    names.push(name)
  }
  return names
}

function named(declaration: Node, reach: Reach): object[] {
  const kind = word(declaration, 'kind') ?? ''
  if (kind !== 'const') throw new NotPlain(`\`${kind}\``, declaration)
  return kids(declaration, 'declarations').map((one) => {
    const stored = value(child(one, 'init'), reach)
    const scope = reach.scopes.at(-1)
    const id = child(one, 'id')
    const name = nameOf(id)
    if (name !== undefined) {
      scope?.set(name, { chain: chainOf(stored, reach) })
      return { const: name, value: stored }
    }
    const names = ownNames(id)
    if (!names) throw new NotPlain('a taking apart other than of a record by its own names', id)
    for (const one of names) scope?.set(one, { chain: false })
    return { const: names, value: stored }
  })
}

function side(node: Node, reach: Reach): object[] {
  return inBlock(reach, [], () =>
    node.type === 'BlockStatement' ? statements(kids(node, 'body'), reach) : statement(node, reach),
  )
}

function repeat(node: Node, reach: Reach): object {
  const left = child(node, 'left')
  const name =
    left.type === 'VariableDeclaration' && left.kind === 'const'
      ? nameOf(kid(kids(left, 'declarations')[0], 'id'))
      : undefined
  if (node.await === true || name === undefined)
    throw new NotPlain('a repeat that is not `for (const name of list)`', node)
  const of = value(child(node, 'right'), reach)
  const body = child(node, 'body')
  // What is repeated is one statement or a block, as each side of a choice is.
  const repeated = inBlock(reach, [name], () =>
    body.type === 'BlockStatement' ? statements(kids(body, 'body'), reach) : statement(body, reach),
  )
  return { for: name, of, do: repeated }
}

function statement(node: Node, reach: Reach): object[] {
  const made = statementOf(node, reach)
  // A statement of a sequence keeps its line, which a finding of the check of the sequence names.
  const line = reach.lineOf?.(node.start)
  return line === undefined ? made : made.map((one) => ({ ...one, line }))
}

function statementOf(node: Node, reach: Reach): object[] {
  const argument = kid(node, 'argument')
  const alternate = kid(node, 'alternate')
  switch (node.type) {
    case 'VariableDeclaration':
      return named(node, reach)
    case 'IfStatement':
      return [
        {
          if: value(child(node, 'test'), reach),
          then: side(child(node, 'consequent'), reach),
          ...(alternate ? { else: side(alternate, reach) } : {}),
        },
      ]
    case 'ForOfStatement':
      return [repeat(node, reach)]
    case 'ReturnStatement':
      return [{ return: argument ? value(argument, reach) : { nothing: true } }]
    case 'ExpressionStatement':
      return [{ do: value(child(node, 'expression'), reach) }]
    case 'BlockStatement':
      throw new NotPlain('a block that stands alone', node)
    default:
      if (typesOnly.has(node.type)) return []
      throw new NotPlain(
        refused[node.type] ?? `the statement \`${node.type.replace('Statement', '').toLowerCase()}\``,
        node,
      )
  }
}

/** The stored statements of a list of statements, in the block of names that is open. */
export function statements(nodes: Node[], reach: Reach): object[] {
  return nodes.flatMap((node) => statement(node, reach))
}

/** The stored statements of the body of an arrow: one `return` for a body that is one value. */
export function bodyOf(node: Node, reach: Reach): object[] {
  const body = child(node, 'body')
  return body.type === 'BlockStatement' ? statements(kids(body, 'body'), reach) : [{ return: value(body, reach) }]
}

/** The stored form of an arrow that is written where it is handed to a word. */
export function arrow(node: Node, reach: Reach): object {
  const names = kids(node, 'params').map((param) => {
    const name = nameOf(param)
    if (name === undefined) throw new NotPlain('an arrow that takes apart what it is handed', param)
    return name
  })
  const body = inBlock(reach, names, () => bodyOf(unwrap(node), reach))
  return { arrow: names, do: body, ...(node.async === true ? { waits: true } : {}) }
}
