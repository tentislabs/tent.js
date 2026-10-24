import { member } from '../handle.ts'

/** The handle of the log: it writes a line of the log and nothing of the app. Every member answers at once. */
interface Log {
  info(message: string, data?: unknown): void
  warn(message: string, data?: unknown): void
  error(message: string, data?: unknown): void
}

export const log: Log = {
  info: member('log', 'info'),
  warn: member('log', 'warn'),
  error: member('log', 'error'),
}
