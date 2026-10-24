import { useEffect, useRef } from 'react'
import { screen, useCall, useQuery } from 'tentjs/ui'
import { addUpdate, look, saveField, setBoth, theDoc, updatesOf, whoIsHere } from './functions'

type Field = 'title' | 'body'

// One row that several people work on. A press in a view is not built yet, so the view hands its calls to
// the test through the window, in an effect: each is what a field and a button of the view would call.
export const docScreen = screen('docScreen', {
  path: '/doc',
  access: 'anyone',
  view: () => {
    const [doc] = useQuery(theDoc).value ?? []
    const id = doc?.id ?? ''
    const updates = useQuery(updatesOf, { doc: id }, { hold: id === '' })
    const present = useQuery(whoIsHere, { doc: id }, { hold: id === '' })
    const save = useCall(saveField)
    const both = useCall(setBoth)
    const add = useCall(addUpdate)
    const looks = useCall(look)
    // What the person saw of each field when they began to change it: the page hands it to the change.
    const saw = useRef({ title: '', body: '' })
    const shown = { title: doc?.title ?? '', body: doc?.body ?? '' }
    const said = (work: Promise<unknown>): Promise<string> =>
      work.then(
        () => 'saved',
        (error) => String(Object(error).code),
      )
    useEffect(() => {
      Object.assign(window, {
        begin: (field: Field) => {
          saw.current[field] = shown[field]
        },
        save: (field: Field, value: string) => said(save.call({ doc: id, field, saw: saw.current[field], value })),
        setBoth: (value: string) => said(both.call({ doc: id, value })),
        addUpdate: (text: string) => said(add.call({ doc: id, text })),
        look: (who: string) => said(looks.call({ doc: id, who })),
      })
    })
    const rows = updates.value ?? []
    return (
      <main style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h1>{shown.title}</h1>
        <span>body: {shown.body}</span>
        <span>{rows.length} updates</span>
        {rows.map((update, place) => <span key={place}>{update.text}</span>)}
        <span>here: {(present.value ?? []).join(', ') || 'nobody'}</span>
      </main>
    )
  },
})
