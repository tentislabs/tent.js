// Runs in the head before the first paint, so a page chosen dark is never drawn light first.
const kept = document.cookie.split('; ').find((one) => /^(__Host-)?tent_state\.tillwise=/.test(one))
let states = {}
try {
  states = kept
    ? JSON.parse(
        atob(
          kept
            .slice(kept.indexOf('=') + 1)
            .replace(/-/g, '+')
            .replace(/_/g, '/'),
        ),
      )
    : {}
} catch {
  states = {}
}
document.documentElement.dataset.mode = states.mode === 'dark' || states.mode === 'light' ? states.mode : 'auto'
