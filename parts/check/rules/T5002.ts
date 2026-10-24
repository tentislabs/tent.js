import type { Node } from '../../build/index.ts'
import { below, kid, word } from '../../build/index.ts'
import { arrowsOfFlow, flowCalls, stepTools } from '../flowCode.ts'
import type { Rule } from '../rule.ts'
import { at, writtenIn } from '../rule.ts'

const marks = new Set(['ParenthesizedExpression', 'TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression'])

/** Each node of a piece of code with the node it stands in. */
function parentsIn(code: Node): Map<Node, Node> {
  const parents = new Map<Node, Node>()
  const visit = (node: Node): void => {
    for (const one of below(node)) {
      parents.set(one, node)
      visit(one)
    }
  }
  visit(code)
  return parents
}

/** The name of the member that a call calls, as `then` of `x.then(...)`, or nothing. */
const memberCalled = (call: Node | undefined): string | undefined => {
  const callee = call?.type === 'CallExpression' ? kid(call, 'callee') : undefined
  return callee?.type === 'MemberExpression' ? word(kid(callee, 'property'), 'name') : undefined
}

/**
 * Whether nothing waits for the promise of a call: it stands alone as a statement, behind `void`, at the end of a
 * chain of `then`, `catch` and `finally` that stands so, or as the answer of an arrow that `forEach` is handed,
 * which drops what each arrow answers.
 */
function leftAlone(call: Node, parents: Map<Node, Node>): boolean {
  let at = call
  for (;;) {
    let up = parents.get(at)
    while (up && marks.has(up.type)) {
      at = up
      up = parents.get(at)
    }
    const member = up?.type === 'MemberExpression' && kid(up, 'object') === at ? up : undefined
    const chained = member ? parents.get(member) : undefined
    if (member && chained?.type === 'CallExpression' && kid(chained, 'callee') === member) {
      const name = word(kid(member, 'property'), 'name') ?? ''
      if (!['then', 'catch', 'finally'].includes(name)) return false
      at = chained
      continue
    }
    if (!up) return false
    if (up.type === 'ExpressionStatement') return true
    if (up.type === 'UnaryExpression' && up.operator === 'void') return true
    if (up.type === 'ArrowFunctionExpression' && kid(up, 'body') === at) {
      const handed = parents.get(up)
      return memberCalled(handed) === 'forEach'
    }
    return false
  }
}

/** A step whose promise nothing waits for: its run would go on before the step is saved. */
export const rule: Rule = {
  code: 'T5002',
  needs: ['source'],
  reads: 'file',
  run: ({ source }) =>
    writtenIn(source)
      .filter((one) => one.word === 'flow')
      .flatMap((flow) =>
        arrowsOfFlow(flow).flatMap((code) => {
          const parents = parentsIn(code)
          return flowCalls(code, flow.words)
            .filter((call) => stepTools.includes(call.name) && leftAlone(call.node, parents))
            .map((call) =>
              at(
                'T5002',
                flow,
                call.node,
                `the promise of \`${call.name}\` is not awaited, so the flow goes on before the step is saved.`,
                `Write \`await\` in front of it, or hand its promise to \`step.all\`.`,
              ),
            )
        }),
      ),
}
