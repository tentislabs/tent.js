// A bot asks a question with lettered choices as a block of its answer:
//
//   ```question
//   What should I focus on first?
//   A. Sorting the inbox
//   B. Drafting replies
//   ```
//
// Claude Code without a window has no tool to ask the person, so the driver reads the block and makes it an ask.

export interface Question {
  before: string
  question: string
  choices: string[]
}

export const questionWords = [
  'When you need the person to choose, end your answer with one question block, and nothing after it:',
  '```question',
  'The question, in one line',
  'A. The first choice',
  'B. The second choice',
  '```',
  'with two to four choices. The person answers with the words of one choice, or with words of their own.',
].join('\n')

export const readQuestion = (text: string): Question | undefined => {
  const found = /```question\s*\n([\s\S]*?)\n```/.exec(text)
  if (!found) return undefined
  const lines = found[1]
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const choices: string[] = []
  const asked: string[] = []
  for (const line of lines) {
    const choice = /^[A-Da-d][.)]\s+(.+)$/.exec(line)
    if (choice) choices.push(choice[1].trim())
    else if (choices.length === 0) asked.push(line)
  }
  if (asked.length === 0 || choices.length < 2) return undefined
  return { before: text.slice(0, found.index).trim(), question: asked.join(' '), choices: choices.slice(0, 4) }
}
