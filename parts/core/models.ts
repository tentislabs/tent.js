/** What is known of a model of a shipped provider: a pattern of its name, with what it can do. */
interface KnownModel {
  provider: string
  // A name, where `*` stands for any letters.
  name: string
  abilities: string[]
  takes?: number
  voices?: string[]
}

const writes = ['reply', 'tools', 'typedAnswers', 'images']
const thinks = [...writes, 'reasoning']

// The voices of the speech of OpenAI. The first is the default.
const voices = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse']

/**
 * The list of what is known of the models of each shipped provider, from the pages of each provider, which
 * `parts/ai/providers/sources.md` names. A row that stands before another wins where both patterns fit a name.
 * What a definition states wins over the list.
 */
export const models: KnownModel[] = [
  { provider: 'anthropic', name: 'claude-3-5-haiku*', abilities: writes, takes: 200_000 },
  { provider: 'anthropic', name: 'claude-3-haiku*', abilities: writes, takes: 200_000 },
  { provider: 'anthropic', name: 'claude-*', abilities: thinks, takes: 200_000 },
  { provider: 'openai', name: 'text-embedding-*', abilities: ['embed'], takes: 8_191 },
  { provider: 'openai', name: 'whisper-*', abilities: ['hear'] },
  { provider: 'openai', name: 'gpt-4o*-transcribe*', abilities: ['hear'] },
  { provider: 'openai', name: 'gpt-4o*-tts*', abilities: ['speak'], voices },
  { provider: 'openai', name: 'tts-*', abilities: ['speak'], voices },
  { provider: 'openai', name: 'gpt-4.1*', abilities: writes, takes: 1_047_576 },
  { provider: 'openai', name: 'gpt-4o*', abilities: writes, takes: 128_000 },
  { provider: 'openai', name: 'gpt-5*', abilities: thinks, takes: 400_000 },
  { provider: 'openai', name: 'o1*', abilities: thinks, takes: 200_000 },
  { provider: 'openai', name: 'o3*', abilities: thinks, takes: 200_000 },
  { provider: 'openai', name: 'o4*', abilities: thinks, takes: 200_000 },
  { provider: 'google', name: 'text-embedding-*', abilities: ['embed'], takes: 2_048 },
  { provider: 'google', name: 'gemini-embedding-*', abilities: ['embed'], takes: 2_048 },
  { provider: 'google', name: 'gemini-1.5-*', abilities: writes, takes: 1_048_576 },
  { provider: 'google', name: 'gemini-2.0-*', abilities: writes, takes: 1_048_576 },
  { provider: 'google', name: 'gemini-*', abilities: thinks, takes: 1_048_576 },
]

/** The providers that ship, by the names a model gives in `provider`. */
export const shippedProviders: readonly string[] = ['anthropic', 'openai', 'openai-style', 'google', 'service']

/**
 * The tools that the server of each shipped provider runs itself, which a model offers where `hosted` names them:
 * from the pages of each provider, which `parts/ai/providers/sources.md` names.
 */
export const hostedTools: Record<string, readonly string[]> = {
  anthropic: ['webSearch', 'webFetch', 'codeExecution'],
  openai: ['webSearch', 'codeInterpreter'],
  google: ['webSearch', 'urlContext', 'codeExecution'],
}

/** Whether a name fits a pattern of the list, where `*` stands for any letters. */
function fits(pattern: string, name: string): boolean {
  const [first = '', ...rest] = pattern.split('*')
  if (!name.startsWith(first)) return false
  let at = first.length
  for (const [i, part] of rest.entries()) {
    const last = i === rest.length - 1
    const found = last
      ? name.endsWith(part) && name.length - part.length >= at
        ? name.length - part.length
        : -1
      : name.indexOf(part, at)
    if (found < 0) return false
    at = found + part.length
  }
  return rest.length > 0 || at === name.length
}

/**
 * Takes a model's record. Answers what is known of it, with what the record states winning over the list:
 * its abilities, the most tokens one request may hold, and its voices. Nothing is known of a model of a
 * provider that does not ship, or of a name that the list does not hold, but what the record states.
 */
export function knownModel(record: Record<string, unknown>): {
  abilities?: string[]
  takes?: number
  voices?: string[]
} {
  const row = models.find((one) => one.provider === record.provider && fits(one.name, String(record.name)))
  const stated = (value: unknown): string[] | undefined => (Array.isArray(value) ? value.map(String) : undefined)
  const abilities = stated(record.abilities) ?? row?.abilities
  const takes = typeof record.takes === 'number' ? record.takes : row?.takes
  const voices = stated(record.voices) ?? row?.voices
  return {
    ...(abilities ? { abilities } : {}),
    ...(takes === undefined ? {} : { takes }),
    ...(voices ? { voices } : {}),
  }
}
