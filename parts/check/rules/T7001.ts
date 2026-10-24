import type { Finding } from '../../core/index.ts'
import type { Rule } from '../rule.ts'
import { at, writtenIn } from '../rule.ts'
import { abilitiesOf, agentsOf } from '../agents.ts'
import { callsIn, toolsOf, isStored } from '../../core/internal.ts'

// The ability that each call of a model needs.
const needs: Record<string, string> = {
  reply: 'reply',
  stream: 'reply',
  fill: 'typedAnswers',
  embed: 'embed',
  hear: 'hear',
  speak: 'speak',
}

/**
 * A model that is used for an ability it does not have, where the check can see the use: an agent with tools
 * on a model without `tools`, the voice of an agent on models that do not hear or speak, the model that
 * writes a summary, and a call of a model in a body that was read. A model whose abilities nothing gives is
 * T7006's, and is passed over here.
 */
export const rule: Rule = {
  code: 'T7001',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    const lacks = (model: string, ability: string): boolean => {
      const abilities = abilitiesOf(description, model)
      return abilities !== undefined && !abilities.includes(ability)
    }
    const fix = (model: string, ability: string): string =>
      `Use a model that can do it, or state \`abilities\` on \`${model}\` where the list of models does not know that it has \`${ability}\`.`
    for (const { written, record } of agentsOf(description, source)) {
      const model = String(record.model)
      if ((toolsOf(record).length || record.tell === 'list') && lacks(model, 'tools'))
        found.push(at('T7001', written, undefined, `its model ${model} cannot use tools.`, fix(model, 'tools')))
      const voice = isStored(record.voice) ? record.voice : undefined
      for (const [part, ability] of [
        ['hear', 'hear'],
        ['speak', 'speak'],
      ] as const)
        if (voice && typeof voice[part] === 'string' && lacks(voice[part], ability))
          found.push(
            at(
              'T7001',
              written,
              undefined,
              `the model ${voice[part]} of its voice cannot ${part}.`,
              fix(String(voice[part]), ability),
            ),
          )
      const memory = isStored(record.memory) ? record.memory : undefined
      const writer = typeof memory?.model === 'string' ? memory.model : model
      if (memory?.shrink === 'summary' && lacks(writer, 'reply'))
        found.push(
          at('T7001', written, undefined, `the model ${writer} cannot write its summary.`, fix(writer, 'reply')),
        )
    }
    for (const written of writtenIn(source)) {
      const record = Object.hasOwn(description.functions, written.name)
        ? description.functions[written.name]
        : Object.hasOwn(description.flows, written.name)
          ? description.flows[written.name]
          : undefined
      if (!record) continue
      for (const call of callsIn([record.body, record.onFail])) {
        const ability = call.kind === 'model' && call.member ? needs[call.member] : undefined
        if (ability && lacks(call.name, ability))
          found.push(
            at(
              'T7001',
              written,
              undefined,
              `calls \`${call.name}.${call.member}\`, which needs \`${ability}\`.`,
              fix(call.name, ability),
            ),
          )
      }
    }
    return found
  },
}
