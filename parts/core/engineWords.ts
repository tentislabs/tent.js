/**
 * The engine's own words to a model, by the names under which an agent's `words` gives others for a
 * conversation in another language. `{}` stands where a value goes.
 */
const ownWords = {
  asksFirst: 'A person is asked before this runs.',
  refused: 'The person refused this.',
  unfinished: 'This did not finish.',
  tooLarge: 'Error T5102: the answer was too large',
  file: 'File {}:',
  summary:
    'Shorten this conversation into at most 300 words. Keep names, numbers, decisions, and what is still open. Write in the language of the conversation.',
  list: 'These are the functions you can use. Each is written as name(input) -> answer, and under it what it is for and what it does. Use one with the tool "call", as { name, input }.',
  call: 'Calls one function of the list by its name, with its input.',
  sequence:
    'Runs several function calls, one after another, as one sequence, and gives back only what the sequence returns. Write "run" as plain statements: const, if, for (const x of list), return, and calls of the functions by their names with their input. A call gives back the answer of its function: use it in the next call. call(name, input) calls a function by its name as text. all(list, (x) => ...) runs calls side by side. No other names exist but the words listed below. Calls whose input is already known are asked about together, so read first and write after. The sequence is checked before it runs, and a mistake is answered with its line.',
  gives: 'Gives {}.',
  reads: 'Reads {}.',
  writes: 'Writes {}.',
  sends: 'Sends data out.',
  joins:
    'A call about the same thing as a run of it already under way joins that run, and is answered what it answers.',
  answer: 'Gives your answer, in the shape it takes. Call it once, when you are done: the run ends with it.',
  guarded: 'That cannot be answered here.',
  handOver:
    'Hands the conversation over to another agent, which answers from the next message on. Name it in "to", and say why in "why". The run ends with it.',
  handedOver: 'This conversation goes on with {}.',
  recalled: 'Earlier messages of this person that may matter here:',
  facts: 'What is known of the person you are talking with, each fact with its id:',
  question:
    'Asks the person a question, and waits for the answer. Give "choices" where the answer is one of a few, or "shape", a JSON Schema, where it is a value of a form.',
  pictureKept: '[A picture was kept as file {}.]',
  soundKept: '[A sound was kept as file {}.]',
  pointedAt: 'The person points at the screen {}.',
  pointedAtPlace: 'The person points at the tag {} of the source of the screen {}.',
  findings: 'The check of the app found these errors. Mend them:',
}

/** A name of the engine's own words. */
type WordName = keyof typeof ownWords

/**
 * The words of the `sequence` tool beyond its first line, which hold code and so no agent gives anew: what a
 * sequence pays for and holds, the line of `fill` where the model has `typedAnswers`, and each value word a sequence
 * may use, as the table of the value words writes its first column.
 */
export const sequenceWords = {
  pays: "A sequence pays where a read and the writes that follow from it are written as one sequence, and where an action for each row of a list is written as one loop, not as one call for each; all(list, (x) => ..., { goOn: true }) goes on past a call that fails. A sequence holds no method of a value - no .push, .map, .filter or .find - and no let. To make a list from a list write each(list, (x) => ...), or all(list, (x) => ...) for calls side by side; to keep some rows write where(rows, { field: value }) with a filter written as a record, as { status: 'open', total: { above: 100 } }, never an arrow.",
  fill: 'fill(shape, prompt) has a text judged into a typed value. Write the shape with text(), number(), boolean(), date(), day(), choice([...]), list(...) and object({...}).',
  renamed: '{} is written {} in a sequence.',
  values: [
    'concat(a, b, ...)',
    'calc(op, a, b)',
    'round(n, digits?)',
    'floor(n), ceil(n)',
    'least(a, b, ...), most(a, b, ...)',
    'lower(text), upper(text), trim(text)',
    'startsWith(text, part), contains(text, part)',
    'slice(text or list, from, to?)',
    'join(list, between)',
    'range(from, to, by?)',
    'where(rows, filter)',
    'sum(list, field?), avg, min, max',
    'each(list, (entry, i) => value)',
    'later(when, length), earlier(when, length)',
    'between(a, b, unit)',
    'dayOf(moment, zone?)',
    'fingerprint(text)',
    'sameSecret(a, b)',
    'chunks(text, o)',
  ],
}

/** The line after a long answer of a tool, in a run of an agent that states `sequence`. */
export const eachOneWords = 'To act on each of these, write one sequence.'

/** The words of one sentence: an agent's own where it gives them, and the engine's otherwise, with a value put in. */
export function wordsOf(words: Record<string, string>, name: WordName, value?: string): string {
  const text = Object.hasOwn(words, name) ? words[name] : ownWords[name]
  // Put in by a function, the value stands as it is: as text, the `$'` and `$&` in it would name parts of the words.
  return value === undefined ? text : text.replace('{}', () => value)
}
