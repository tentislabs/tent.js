import { Link, screen, useMicrophone } from 'tentjs/ui'

// A screen that records, whose recording can be begun twice, cancelled, or left while the browser is asked.
export const recordScreen = screen('recordScreen', {
  path: '/record',
  access: 'anyone',
  title: 'Record',
  view: () => {
    const microphone = useMicrophone()
    return (
      <main>
        <h1>Record</h1>
        <button type="button" onClick={() => void microphone.start()}>
          Record
        </button>
        <button type="button" onClick={() => microphone.cancel()}>
          Cancel
        </button>
        <span id="state">State {microphone.state}</span>
        <Link to="/away" id="away">
          Away
        </Link>
      </main>
    )
  },
})

export const awayScreen = screen('awayScreen', {
  path: '/away',
  access: 'anyone',
  title: 'Away',
  view: () => (
    <main>
      <h1>Away</h1>
    </main>
  ),
})
