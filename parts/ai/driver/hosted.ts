import type { Running } from './running.ts'
import { askTimeOf } from './agentOf.ts'

/**
 * Takes a run. Answers the provider's own tools that its model steps offer: of those the model names, each that
 * `trust` names, and each other that the starter agreed to, asked once in the step `ask hosted <name>` before the
 * first model step. Such a tool sends data out, so it is asked about as one: under a tool call that agreed to
 * nothing a trusted one asks too, and in a run of the system, where nobody can be asked, only a trusted one is
 * offered.
 */
export async function hostedOf(r: Running): Promise<string[]> {
  const description = r.env.description(r.run.version)
  const model = Object.hasOwn(description.models, r.agent.model) ? description.models[r.agent.model] : {}
  const named = Array.isArray(model.hosted) ? model.hosted.map(String) : []
  const offered: string[] = []
  for (const name of named) {
    if (r.agent.trust.includes(name) && !r.told.called) {
      offered.push(name)
      continue
    }
    if (r.starter.kind === 'system') continue
    const said = await r.step.waitFor(`ask hosted ${name}`, {
      timeout: askTimeOf(r.agent),
      show: { tool: name, hosted: true },
    })
    if ('approved' in said && said.approved === true) offered.push(name)
  }
  return offered
}
