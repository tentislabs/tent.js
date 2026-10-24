import { screen, read, Form } from 'tentjs/ui'
import { addHome, allHomes } from './moves'

export const homesScreen = screen('homesScreen', {
  path: '/homes',
  access: 'anyone',
  title: 'Homes',
  data: { homes: read(allHomes) },
  view: ({ homes }) => (
    <main>
      <Form id="add" call={addHome} values={{ address: { city: 'Izmir' } }}>
        <input id="owner" name="owner" />
        <input id="city" name="address.city" />
        <input id="street" name="address.street" />
      </Form>
      <Form
        id="tagged"
        call={addHome}
        sendOnEnter={false}
        values={{ owner: 'Tag', address: { city: 'Bursa', street: 'Long' } }}
      >
        <input id="tag" name="tag" />
        <button type="submit" id="sendTag">
          Add with a tag
        </button>
      </Form>
      <ul>
        {homes.map((o) => (
          <li key={o.id} className="home">
            {o.owner} {o.address.city} {o.address.street} {o.tag ?? ''}
          </li>
        ))}
      </ul>
    </main>
  ),
})
