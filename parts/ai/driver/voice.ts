import type { Caller } from '../../core/index.ts'
import type { AiEnv } from '../face.ts'
import { modelCall } from '../layer/modelCall.ts'
import type { AgentOf } from './agentOf.ts'

/** Where a run hears and speaks: the env, the agent, the run with its steps, and its starter. */
interface Voicing {
  env: AiEnv
  agent: AgentOf
  run: { id: string; version: string; signal: AbortSignal }
  starter: Caller
  step: (name: string, work: () => unknown) => Promise<unknown>
}

/** Whether a value is what `hear` answers. */
const isHeard = (value: unknown): value is { text: string } => typeof Reflect.get(Object(value), 'text') === 'string'

/**
 * Takes where a run hears, the recording of its start, and what the person typed. In the step `hear` the
 * agent's hearing model turns the recording into text, which is put after the typed message on a new line.
 * Answers the message that the model is handed.
 */
export async function heardMessage(v: Voicing, audio: string, typed: string): Promise<string> {
  const voice = v.agent.voice
  if (!voice) return typed
  const heard: unknown = await v.step('hear', () =>
    modelCall(v.env, {
      model: voice.hear,
      method: 'hear',
      args: [audio, voice.language === undefined ? {} : { language: voice.language }],
      caller: v.starter,
      version: v.run.version,
      at: { run: v.run.id, step: 'hear', repeat: 1 },
      signal: v.run.signal,
    }),
  )
  const text = isHeard(heard) ? heard.text : ''
  return typed ? `${typed}\n${text}` : text
}

/** The sentences of an answer, each with the mark that ends it, as a speaking model speaks them one by one. */
function sentencesOf(text: string): string[] {
  const sentences: string[] = []
  let begun = 0
  for (let at = 0; at < text.length; at++) {
    const mark = text[at]
    const next = text[at + 1]
    if ((mark === '.' || mark === '!' || mark === '?') && (next === undefined || /\s/.test(next))) {
      const sentence = text.slice(begun, at + 1).trim()
      if (sentence) sentences.push(sentence)
      begun = at + 1
    }
  }
  const rest = text.slice(begun).trim()
  if (rest) sentences.push(rest)
  return sentences
}

/**
 * Takes where a run speaks, and the answer of its last `model` step. Speaks it sentence by sentence, each in a step
 * of its own, `speak 1` and on, or as one sound where the voice says `whole`, and tells whoever watches the run of
 * each sound, which the page plays in its order. Each sound is a file of the starter, made by the run.
 */
export async function spokenAnswer(v: Voicing, text: string): Promise<void> {
  const voice = v.agent.voice
  if (!voice || !text) return
  const sentences = voice.whole ? [text] : sentencesOf(text)
  for (const [i, sentence] of sentences.entries()) {
    const name = `speak ${i + 1}`
    const file: unknown = await v.step(name, () =>
      modelCall(v.env, {
        model: voice.speak,
        method: 'speak',
        args: [sentence, voice.name === undefined ? {} : { name: voice.name }],
        caller: v.starter,
        version: v.run.version,
        at: { run: v.run.id, step: name, repeat: 1 },
        signal: v.run.signal,
      }),
    )
    if (typeof file === 'string') v.env.tell(v.run.id, { kind: 'audio', step: name, file })
  }
}
