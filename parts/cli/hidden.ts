/**
 * Reads what a person types at the keys until the end of the line, and shows none of it. The input is a terminal.
 * Answers the line, or nothing where the key that ends a program was typed.
 */
export function typedHidden(): Promise<string | undefined> {
  const input = process.stdin
  input.setRawMode(true)
  input.setEncoding('utf8')
  input.resume()
  return new Promise((done) => {
    let typed = ''
    const ended = (line: string | undefined): void => {
      input.setRawMode(false)
      input.pause()
      input.off('data', took)
      process.stderr.write('\n')
      done(line)
    }
    const took = (keys: string): void => {
      for (const key of keys) {
        if (key === '\r' || key === '\n') {
          ended(typed)
          return
        }
        // The key that ends a program ends the question, and nothing is taken.
        if (key === '\u0003') {
          ended(undefined)
          return
        }
        if (key === '\u007f' || key === '\b') typed = typed.slice(0, -1)
        else typed += key
      }
    }
    input.on('data', took)
  })
}

/**
 * Asks for a value without showing it. With a person at the keys, it prints the question and reads what is typed
 * until the end of the line, and shows none of it. With no person at the keys it reads the value from its input,
 * so that a script and a coding agent can hand one in: everything that the input holds, without the end of its last line.
 */
export async function hiddenValue(question: string): Promise<string> {
  const input = process.stdin
  if (!input.isTTY) {
    let all = ''
    input.setEncoding('utf8')
    for await (const part of input) all += part
    return all.replace(/\r?\n$/, '')
  }
  process.stderr.write(question)
  const typed = await typedHidden()
  if (typed === undefined) throw new Error('The value was not given.')
  return typed
}
