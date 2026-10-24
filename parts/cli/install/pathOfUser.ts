import { TentError } from '../../core/index.ts'
import { ran } from './ran.ts'

/** Runs a line of PowerShell, and answers what it printed, or nothing where it failed. */
function powershell(line: string): string | undefined {
  const done = ran('powershell', ['-NoProfile', '-NonInteractive', '-Command', line])
  return done.ok ? done.printed.replace(/\r?\n$/, '') : undefined
}

/** The path of the current user of Windows, as the system keeps it, with its variables unread. Nothing where it has none. */
export const pathOfUser = (): string | undefined =>
  powershell(
    "$k = Get-Item -LiteralPath 'HKCU:\\Environment'; $v = $k.GetValue('Path', $null, 'DoNotExpandEnvironmentNames'); if ($v -ne $null) { $v }",
  )

/**
 * Sets the path of the current user of Windows by the system's own way, which tells every open program that it
 * changed, so that a terminal opened after it finds it.
 */
export function setPathOfUser(value: string): void {
  const quoted = `'${value.replaceAll("'", "''")}'`
  if (powershell(`[Environment]::SetEnvironmentVariable('Path', ${quoted}, 'User')`) === undefined)
    throw new TentError('T0013', 'The path of the current user could not be written.', {
      fix: 'Change your path by hand, in the settings of Windows.',
    })
}
