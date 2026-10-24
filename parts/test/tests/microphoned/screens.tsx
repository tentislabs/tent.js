import { screen, useMicrophone } from 'tentjs/ui'

// A screen that records. The screen of `home.tsx` records nothing.
export const recordScreen = screen('recordScreen', {
  path: '/record',
  access: 'anyone',
  title: 'Record',
  view: () => {
    const microphone = useMicrophone()
    return (
      <main>
        <button type="button" onClick={() => void microphone.start()}>
          Record
        </button>
      </main>
    )
  },
})
