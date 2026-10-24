import { underWay } from '../context.ts'
import type { Opened } from '../opened.ts'

/** What the data of a line is kept as: its JSON text, or nothing where it holds none or cannot be written. */
function kept(data: unknown): string | undefined {
  if (data === undefined) return undefined
  try {
    return JSON.stringify(data)
  } catch {
    return undefined
  }
}

/**
 * The working object behind the handle `log`: each member writes one line of the log of the app, with the
 * definition whose code wrote it, and nothing of the app.
 */
export const handle = (o: Opened): object => {
  const line =
    (level: string) =>
    (message: unknown, data?: unknown): void => {
      const cx = underWay()
      o.log.write('lines', {
        at: o.clock.now(),
        level,
        message: String(message),
        data: kept(data),
        name: cx?.work.name,
        run: cx?.run?.id,
      })
    }
  return { info: line('info'), warn: line('warn'), error: line('error') }
}
