import { useState } from 'react'
import { MicIcon, PlusIcon, WaveIcon } from './icons'

/** The field at the foot of a talk: a round "+", the words, a microphone and a round button of the bot's colour. */
export function Composer({
  placeholder,
  onSend,
  busy,
}: {
  placeholder: string
  onSend: (message: string) => void
  busy?: boolean
}) {
  const [words, setWords] = useState('')
  return (
    <div className="composer">
      <form
        aria-label="Message"
        onSubmit={(event) => {
          event.preventDefault()
          const message = words.trim()
          if (!message || busy) return
          setWords('')
          onSend(message)
        }}
      >
        <button type="button" className="plain-icon circle" aria-label="Add a file" tabIndex={-1}>
          <PlusIcon />
        </button>
        <input
          name="message"
          aria-label="Message"
          placeholder={placeholder}
          autoComplete="off"
          value={words}
          onChange={(event) => setWords(event.target.value)}
        />
        <button type="button" className="plain-icon" aria-label="Dictate" tabIndex={-1}>
          <MicIcon />
        </button>
        <button type="submit" className="voice" aria-label="Send" disabled={busy}>
          <WaveIcon />
        </button>
      </form>
    </div>
  )
}
