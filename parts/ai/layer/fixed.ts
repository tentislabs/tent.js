import { TentError } from '../../core/index.ts'
import type { Asking } from './ask.ts'
import { ask } from './ask.ts'
import { cannot } from './record.ts'
import { tokensOf } from './size.ts'

const kinds: Record<string, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', opus: 'audio/ogg' }

/**
 * Takes a model call and a text or a list of texts. Asks the model for their vectors, on that model alone: vectors
 * of two models cannot be mixed. Answers a vector, or a list of them in the order of the texts.
 */
export async function embedded(asking: Asking, given: unknown): Promise<number[] | number[][]> {
  const many = Array.isArray(given)
  const texts = (many ? given : [given]).map((one) => {
    if (typeof one !== 'string') throw new TentError('T0002', 'What `embed` is handed is a text, or a list of texts.')
    return one
  })
  const vectors = await ask({ ...asking, alone: true }, async ({ provider, model, base, tally }) => {
    if (!provider.embed) throw cannot(model.name, 'vectors')
    tally.units.calls = 1
    try {
      const made = await provider.embed({ ...base, texts })
      Object.assign(tally.units, made.units ?? {})
      if (made.raw !== undefined) tally.raw = made.raw
      return made.vectors
    } finally {
      if (tally.units.tokensIn === undefined) {
        tally.units.tokensIn = tokensOf(texts.join(''))
        tally.counted.push('tokensIn')
      }
    }
  })
  return many ? vectors : vectors[0]
}

/**
 * Takes a model call, the words, and the texts to rank by them. Asks a model that states the kind `rank` how well
 * each text fits the words. Answers one score for each text, in their order. Throws T0002 for what is no text, and
 * T7001 for a model that cannot rank.
 */
export async function rankedTexts(asking: Asking, words: unknown, given: unknown): Promise<number[]> {
  if (typeof words !== 'string' || !Array.isArray(given) || !given.every((one) => typeof one === 'string'))
    throw new TentError('T0002', 'What `rank` is handed is the words, and a list of texts.')
  const texts = given.map(String)
  return ask(asking, async ({ provider, model, base, tally }) => {
    if (!provider.rank) throw cannot(model.name, 'a ranking')
    tally.units.calls = 1
    try {
      const made = await provider.rank({ ...base, words, texts })
      Object.assign(tally.units, made.units ?? {})
      if (made.raw !== undefined) tally.raw = made.raw
      if (made.scores.length !== texts.length || !made.scores.every(Number.isFinite))
        throw new TentError('T7108', `The model ${model.name} gave no score for each of the ${texts.length} texts.`, {
          fix: 'A provider that ranks answers one finite score for each text, in their order.',
        })
      return made.scores
    } finally {
      if (tally.units.tokensIn === undefined) {
        tally.units.tokensIn = tokensOf([words, ...texts].join(''))
        tally.counted.push('tokensIn')
      }
    }
  })
}

/**
 * Takes a model call, the id of a recording, and its language and a hint. Reads the recording as the caller may
 * download it, and asks the model for its text. Answers `{ text, language, seconds }`.
 */
export async function heardFile(
  asking: Asking,
  file: unknown,
  stated: Record<string, unknown>,
): Promise<{ text: string; language: string; seconds: number }> {
  const o = {
    ...(typeof stated.language === 'string' ? { language: stated.language } : {}),
    ...(typeof stated.hint === 'string' ? { hint: stated.hint } : {}),
  }
  if (typeof file !== 'string') throw new TentError('T0002', 'What `hear` is handed is the id of a file.')
  const info = asking.env.files.info(file, asking.caller)
  const audio = await asking.env.files.bytes(file, asking.caller)
  return ask(asking, async ({ provider, model, base, tally }) => {
    if (!provider.hear) throw cannot(model.name, 'hearing')
    tally.units.calls = 1
    const heard = await provider.hear({
      ...base,
      audio,
      kind: info.kind,
      ...(o.language === undefined ? {} : { language: o.language }),
      ...(o.hint === undefined ? {} : { hint: o.hint }),
    })
    Object.assign(tally.units, heard.units ?? {})
    if (tally.units.seconds === undefined) {
      tally.units.seconds = heard.seconds
      tally.counted.push('seconds')
    }
    if (heard.raw !== undefined) tally.raw = heard.raw
    return { text: heard.text, language: heard.language ?? o.language ?? '', seconds: heard.seconds }
  })
}

/**
 * Takes a model call, a text, and a voice, a format and a speed. Asks the model for its sound: `name` is a voice
 * of the model it is written for, and a fall-back speaks with its own default voice. Stores the sound as a file of
 * the caller, and answers its id.
 */
export async function spokenText(asking: Asking, text: unknown, o: Record<string, unknown>): Promise<string> {
  if (typeof text !== 'string') throw new TentError('T0002', 'What `speak` is handed is a text.')
  const format = o.format ?? 'mp3'
  if (format !== 'mp3' && format !== 'wav' && format !== 'opus')
    throw new TentError('T0002', 'The format of `speak` is mp3, wav or opus.')
  const audio = await ask(asking, async ({ provider, model, base, tally }) => {
    if (!provider.speak) throw cannot(model.name, 'speech')
    tally.units.calls = 1
    const voice = model.name === asking.model && typeof o.name === 'string' ? o.name : model.voices?.[0]
    try {
      const made = await provider.speak({
        ...base,
        text,
        format,
        ...(voice === undefined ? {} : { voice }),
        ...(typeof o.speed === 'number' ? { speed: o.speed } : {}),
      })
      Object.assign(tally.units, made.units ?? {})
      if (made.raw !== undefined) tally.raw = made.raw
      return made.audio
    } finally {
      if (tally.units.characters === undefined) {
        tally.units.characters = [...text].length
        tally.counted.push('characters')
      }
    }
  })
  const run = asking.at?.run
  return asking.env.files.put(
    audio,
    { name: `spoken.${format}`, kind: kinds[format] },
    { caller: asking.caller, ...(run ? { run } : {}) },
  )
}
