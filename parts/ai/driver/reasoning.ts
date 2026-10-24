import type { Running } from './running.ts'

/**
 * Takes a run and the name of a step that calls its model. Answers what the call is handed for the reasoning that
 * the model writes for itself, which tells each part to whoever follows the run where the agent states `show`, and
 * what was written of it in the step so far. Reasoning that begins anew is dropped.
 */
export function reasoningFor(r: Running, step: string): { reasoning(part: string | null): void; written(): string } {
  const tell = (part: object): void => r.env.tell(r.run.id, part)
  let written = ''
  return {
    reasoning: (part) => {
      if (part === null) {
        written = ''
        if (r.agent.reasoning.show) tell({ kind: 'reasoning', step, text: '', anew: true })
        return
      }
      written += part
      if (r.agent.reasoning.show) tell({ kind: 'reasoning', step, text: part })
    },
    written: () => written,
  }
}

/**
 * Takes a run, what a step saves and the reasoning the model wrote in it. Answers what the step saves with the
 * reasoning where the agent states `save`: held to `limits.result` as every step is, so the reasoning is left out
 * first, and marked as left out, where it would pass it.
 */
export function withReasoning<T extends object>(
  r: Running,
  saved: T,
  reasoning: string,
): T & { reasoning?: string; reasoningLeftOut?: true } {
  if (!r.agent.reasoning.save || !reasoning) return saved
  const whole = { ...saved, reasoning }
  return Buffer.byteLength(JSON.stringify(whole)) > r.agent.limits.result ? { ...saved, reasoningLeftOut: true } : whole
}
