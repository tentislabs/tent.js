import { spawn, spawnSync } from 'node:child_process'

/**
 * Whether this system has a screen to show a browser on. On Linux a window is shown on a display that the system
 * names, by X or by Wayland; a system with neither, as a server or a shell of WSL, has none.
 */
const hasScreen = (): boolean =>
  process.platform !== 'linux' || Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY)

/**
 * Takes an address. Opens it in an ordinary tab of the person's default browser, by the system's own way, and
 * answers whether it could: not where the system has no screen, or on Linux no `xdg-open` to start it with.
 */
export function openTab(address: string): boolean {
  if (!hasScreen()) return false
  if (process.platform === 'linux' && spawnSync('which', ['xdg-open']).status !== 0) return false
  const [program, words] =
    process.platform === 'win32'
      ? ['rundll32', ['url.dll,FileProtocolHandler', address]]
      : process.platform === 'darwin'
        ? ['open', [address]]
        : ['xdg-open', [address]]
  const child = spawn(program, words, { detached: true, stdio: 'ignore', windowsHide: true })
  child.on('error', () => undefined)
  child.unref()
  return true
}
