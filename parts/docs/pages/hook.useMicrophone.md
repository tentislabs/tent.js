# `useMicrophone`

Records the voice of the person from the code of a view, and uploads the recording like any file, for an agent that hears.

## Example

```tsx
import { screen, useAgent, useMicrophone } from 'tentjs/ui'
import { helper } from '../functions/helper'

export const talkScreen = screen('talkScreen', {
  path: '/talk',
  access: 'signedIn',
  view: () => {
    const a = useAgent(helper, { speak: true })
    const mic = useMicrophone()
    const done = async () => {
      const audio = await mic.stop()
      if (audio) await a.send('', { audio })
    }
    return mic.state === 'recording' ? (
      <button type="button" onClick={done}>Send ({mic.seconds} s)</button>
    ) : (
      <button type="button" onClick={() => mic.start()}>Talk</button>
    )
  },
})
```

## Takes

`useMicrophone()` takes nothing.

## Returns

`{ start, stop, cancel, state, level, seconds }`. `start()` asks the browser for the microphone and records. `stop()` ends the recording, uploads it, and answers its file id, or nothing where nothing was recorded. `cancel()` ends it and keeps nothing. `state` is `'idle'`, `'asking'`, `'recording'` or `'denied'`, the last where the browser or the person refused the microphone. `level` is how loud the sound is now, from 0 to 1, and `seconds` how long the recording has lasted.

A screen or a component whose file imports `useMicrophone` opens the microphone for the app's own address, on every page of the app, with no entry of `unlock`.

A recording is a file with no row to hold it: until a row holds it, only the caller who uploaded it may download it, and it is removed after an hour. A recording sent on a conversation is held by its row and kept.

## See also

`hook.useAgent`, `option.project.unlock`
