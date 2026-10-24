import type { Description } from '../../core/internal.ts'
import { toolLine } from '../../core/internal.ts'
import type { Change } from '../../history/index.ts'
import type { ImpactLine, ImpactFacts } from './face.ts'
import { fileOf, recordsOf } from './read.ts'

/** The tools an agent tells a model of, each by the name it is told under. */
function toldOf(description: Description, agent: string): string[] {
  const record = recordsOf(description, 'flows')[agent]
  const tools: unknown = Reflect.get(Object(record?.agent), 'tools')
  return (Array.isArray(tools) ? tools : []).map((one) => {
    const name: unknown = Reflect.get(Object(one), 'name')
    const tool: unknown = Reflect.get(Object(one), 'tool')
    return typeof name === 'string' ? name : typeof tool === 'string' ? tool : String(one)
  })
}

/**
 * Takes the description that runs, the one that would follow it, the changes between them, and what the running
 * app tells. Answers the work under way that the change meets: the runs of each flow that stand in a step that
 * changed or is gone, by count, which keep the version they started on; and for each agent whose tools change,
 * each tool whose line the model is told changes, with the line on both sides.
 */
export function workOf(live: Description, next: Description, changes: Change[], facts: ImpactFacts): ImpactLine[] {
  const found: ImpactLine[] = []
  for (const change of changes) {
    if (change.what !== 'step' || change.change === 'added') continue
    const [flow, ...rest] = change.name.split('.')
    const step = rest.join('.')
    const count = (facts.runs ?? [])
      .filter((one) => one.flow === flow && one.step === step)
      .reduce((sum, one) => sum + one.count, 0)
    if (!count) continue
    found.push({
      name: change.name,
      kind: 'step',
      file: fileOf(next, flow) || fileOf(live, flow),
      change: `${count} ${count === 1 ? 'run stands' : 'runs stand'} in it, and keep their version`,
    })
  }
  const flowsWas = recordsOf(live, 'flows')
  for (const [agent, record] of Object.entries(recordsOf(next, 'flows'))) {
    if (!record.agent || !flowsWas[agent]?.agent) continue
    for (const told of toldOf(next, agent)) {
      if (!toldOf(live, agent).includes(told)) continue
      const [before, after] = [toolLine(live, agent, told), toolLine(next, agent, told)]
      if (before === after) continue
      found.push({
        name: `${agent}.${told}`,
        kind: 'tool',
        file: fileOf(next, agent),
        change: `its line "${before}" -> "${after}"`,
      })
    }
  }
  return found
}
