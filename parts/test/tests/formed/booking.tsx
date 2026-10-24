import { screen, read, useField, Form } from 'tentjs/ui'
import { allStays, book } from './functions'

/** The guest, a field that `useField` drives: its label, its control, and the words of its failed check. */
function Guest() {
  const f = useField('guest')
  return (
    <label id="guest">
      {f.label} <input {...f.input} />
      {f.error && (
        <span id={f.errorId} className="error">
          {f.error}
        </span>
      )}
    </label>
  )
}

export const bookingScreen = screen('bookingScreen', {
  path: '/booking',
  access: 'anyone',
  title: 'A booking',
  data: { stays: read(allStays) },
  view: ({ stays }) => (
    <main>
      <Form id="book" call={book}>
        <Guest />
        <label>
          Mail <input id="mail" name="mail" type="email" />
        </label>
        <label>
          Nights <input id="nights" name="nights" type="range" min={1} max={9} />
        </label>
        <label>
          <input id="agreed" name="agreed" type="checkbox" /> Agreed
        </label>
        <label>
          At <input id="at" name="at" type="datetime-local" />
        </label>
        <label>
          On <input id="on" name="on" type="date" />
        </label>
        <fieldset id="size">
          <label>
            <input type="radio" name="size" value="small" /> Small
          </label>
          <label>
            <input type="radio" name="size" value="large" /> Large
          </label>
        </fieldset>
        <select id="extras" name="extras" multiple>
          <option value="bed">Bed</option>
          <option value="desk">Desk</option>
          <option value="view">View</option>
        </select>
        <label>
          Price <input id="price" name="price" type="number" />
        </label>
        <button type="submit" id="send">
          Book
        </button>
      </Form>
      <ul>
        {stays.map((o) => (
          <li key={o.id} className="stay">
            <span className="who">
              {o.guest} {o.mail} {o.nights} {o.size}
            </span>
            <span className="when">
              {o.at} {o.on}
            </span>
            <span className="what">
              {o.extras.join('+')} {o.price} {o.agreed ? 'agreed' : 'open'} {o.quiet ? 'quiet' : 'loud'}
            </span>
          </li>
        ))}
      </ul>
    </main>
  ),
})
