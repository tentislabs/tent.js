import { spawnSync } from 'node:child_process'
import { statSync } from 'node:fs'

// The rights of Windows that change what a folder or a file holds: writing, adding, removing, and the rights
// themselves, alone or as the generic and the whole ones.
const writes = 0x2 | 0x4 | 0x10 | 0x40 | 0x100 | 0x10000 | 0x40000 | 0x80000 | 0x10000000 | 0x40000000

// Who may hold every right on Windows without standing against a folder: the system, the administrators, and the
// owner of what is made in it.
const trusted = ['S-1-5-18', 'S-1-5-32-544', 'S-1-3-0']

/**
 * Takes a path that is there. Answers why another user than the current one may change it, or nothing where no one
 * may: one that the current user does not own, or one that others can write. On Windows the rights are read from
 * the system by the numbers that name each user, so that no name in another language is misread.
 */
export function openToOthers(path: string): string | undefined {
  if (process.platform !== 'win32') {
    const about = statSync(path)
    if (typeof process.getuid === 'function' && about.uid !== process.getuid())
      return 'the current user does not own it'
    return (about.mode & 0o022) === 0 ? undefined : 'others can write into it'
  }
  const line = [
    `$a = Get-Acl -LiteralPath '${path.replaceAll("'", "''")}'`,
    '$me = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value',
    "$sid = { param($r) try { $r.Translate([System.Security.Principal.SecurityIdentifier]).Value } catch { '' } }",
    "'owner ' + (& $sid ([System.Security.Principal.NTAccount]$a.Owner)) + ' ' + $me",
    "foreach ($e in $a.Access) { if ($e.AccessControlType -eq 'Allow') { 'right ' + (& $sid $e.IdentityReference) + ' ' + [int64]$e.FileSystemRights } }",
  ].join('; ')
  const done = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', line], {
    encoding: 'utf8',
    windowsHide: true,
  })
  const lines = done.stdout.split(/\r?\n/).filter(Boolean)
  const [, owner, me] = (lines.find((one) => one.startsWith('owner ')) ?? '').split(' ')
  if (!me) return 'its rights could not be read'
  if (owner !== me && !trusted.includes(owner ?? '')) return 'the current user does not own it'
  for (const one of lines.filter((each) => each.startsWith('right '))) {
    const [, who = '', rights = '0'] = one.split(' ')
    if (who !== me && !trusted.includes(who) && (Number(rights) & writes) !== 0) return 'others can write into it'
  }
  return undefined
}
