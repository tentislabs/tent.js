import { boolean, number, TentError, text } from '../../core/index.ts'
import { finding } from '../../core/internal.ts'
import type { Command } from '../command.ts'
import { startDev } from '../dev.ts'

/**
 * Builds the project, runs it in the mode `development` and watches its folder, until the program is told to
 * end: open pages follow each save. The port is 3000 where `--port` names none, and the next free one where that
 * one is taken. `--inspect <origin>` prints an address in the inspect mode, for a tool of that origin. `--fresh` empties the development data first and applies the seed again. A second `tent dev` in
 * one project is refused, and names the first. When it ends it closes its engine, and answers what it ran.
 */
export const command: Command = {
  name: 'dev',
  args: {
    port: number({ optional: true }),
    fresh: boolean({ optional: true }),
    mail: boolean({ optional: true }),
    keep: boolean({ optional: true }),
    inspect: text({ optional: true }),
  },
  needs: 'project',
  run: async ({ args, folder }) => {
    // The program is ended by a signal: the engine is closed first, so that its calls end and its file is removed.
    const signals = ['SIGINT', 'SIGTERM'] as const
    const ending = new AbortController()
    let ended = (): void => undefined
    const stopped = new Promise<void>((done) => {
      ended = done
    })
    const told = (): void => {
      ending.abort()
      ended()
    }
    for (const signal of signals) process.once(signal, told)
    try {
      // Said beside the answer, on the standard error: the answer of the command is what it prints when it ends.
      const dev = await startDev(folder, {
        ...(typeof args.port === 'number' ? { port: args.port } : {}),
        ...(args.fresh === true ? { fresh: true } : {}),
        ...(args.mail === true ? { mail: true } : {}),
        ...(args.keep === true ? { keep: true } : {}),
        ...(typeof args.inspect === 'string' ? { inspect: args.inspect } : {}),
        signal: ending.signal,
        out: (line) => console.error(line),
      })
      try {
        await stopped
        return { value: dev.ran() }
      } finally {
        await dev.close()
      }
    } catch (error) {
      // A project that runs already is a finding, which names the program: no second engine is started.
      if (!(error instanceof TentError)) throw error
      return { findings: [finding(error.code, error.message, error.fix === undefined ? {} : { fix: error.fix })] }
    } finally {
      for (const signal of signals) process.removeListener(signal, told)
    }
  },
}
