import { useState } from 'react'
import { Form } from 'tentjs/ui'
import { addBot } from '../functions/bots'
import { CloseButton, Dialog } from './Dialog'
import { Face } from './Face'
import { type BotColour, type BotShape, botColours, botShapes } from '../lib/looks'
import { COLOURS } from './looks'

/** Create New Bot: its face large at the top, its name, thirteen shapes and eleven colours. */
export function CreateBot({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [shape, setShape] = useState<BotShape>('star')
  const [colour, setColour] = useState<BotColour>('brown')
  return (
    <Dialog label="Create New Bot" onClose={onClose} className="dialog">
      <Form
        id="create"
        call={addBot}
        aria-label="Create New Bot"
        then={(bot) => {
          // The window keeps its sidebar across the move, so the dialog closes itself once the bot is made.
          onClose()
          return { goTo: bot ? `/bots/${String(Object(bot).id)}` : undefined }
        }}
        reset={false}
      >
        <div className="dialog-head">
          <h2>Create New Bot</h2>
          <CloseButton onClose={onClose} />
        </div>
        <div className="dialog-body">
          <Face shape={shape} colour={colour} size={130} />
          <input
            className="name-field"
            name="name"
            aria-label="Name"
            placeholder="Name your Bot"
            autoComplete="off"
            maxLength={60}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <fieldset className="shapes" aria-label="Shape">
            {botShapes.map((one) => (
              <label key={one} className="pick" title={one}>
                <input
                  type="radio"
                  name="shape"
                  value={one}
                  className="hidden-words"
                  checked={shape === one}
                  onChange={() => setShape(one)}
                />
                <Face shape={one} colour={colour} size={40} label={one} />
              </label>
            ))}
          </fieldset>
          <fieldset className="colours" aria-label="Colour">
            {botColours.map((one) => (
              <label key={one} className="pick" title={one}>
                <input
                  type="radio"
                  name="colour"
                  value={one}
                  className="hidden-words"
                  aria-label={one}
                  checked={colour === one}
                  onChange={() => setColour(one)}
                />
                <span style={{ background: COLOURS[one] }} />
              </label>
            ))}
          </fieldset>
        </div>
        <div className="dialog-foot">
          <button type="button" className="outlined" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="light" disabled={name.trim() === ''}>
            Create
          </button>
        </div>
      </Form>
    </Dialog>
  )
}
