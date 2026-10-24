# `useField`

Makes a control of your own a field of the `Form` it stands in: it gives what a native control spreads, made from the type of that field, and tells the control its failure.

## Example

```tsx
import { useField } from 'tentjs/ui'

export function NoteField() {
  const f = useField('note')
  return (
    <label>
      {f.label} <textarea {...f.input} />
      {f.error && <span id={f.errorId}>{f.error}</span>}
    </label>
  )
}
```

`<NoteField />` then stands inside a `<Form call={addNote}>` whose function takes a `note`.

## Takes

`useField(name)`: the name of a field of the input of what the form calls. A dotted name reaches into a record, `useField('address.city')`.

## Returns

`{ input, value, set, error, errorId, invalid, busy, required, label, help, type, ref, progress }`.

`input` is what a native control spreads, made from the declared type of the field: its `name` and `id`, `type`, its limits as `min`, `max`, `minLength` and `maxLength`, `required`, `value` or `checked`, `onChange` and `ref`, and after a failure `aria-invalid` and `aria-describedby`. A control may state another attribute after the spread: `<input {...f.input} type="email" />`.

| Type of the field | What `input` writes |
|---|---|
| `text` | `type="text"`, or `password` with `secret: true`, with `minLength` and `maxLength`. A `<textarea>` takes it as it is |
| `number` | `type="number"`, with `min`, `max`, and `step` of 1 for a whole number |
| `boolean` | `type="checkbox"`, with `checked` |
| `date` | `type="datetime-local"`, in the viewer's time zone |
| `day` | `type="date"` |
| `choice`, `link` | No `type`: a `<select>` or a group of radios takes it. The values of a `choice` are in `type`; the rows of a `link` come from the data of the view |
| `file` | `type="file"`, with `accept` from its `kinds` |
| a `list` of `choice`, of `link` or of `file` | `multiple` |

`value` and `set` are what the field holds and how a control that is no native one changes it. `error` is the words of its failure, and `errorId` the `id` of the element that shows them, which `aria-describedby` names. `invalid` is whether it failed, and `busy` whether the form is sending. `label`, `help` and `required` come from the type, and a field with no label is labelled by its name turned into words. `ref` is put on the element that takes the focus when the field fails. `progress` is how far the file of a `file` field has uploaded, from 0 to 1.

**A control that sends another value than it shows.** A field of money that a person types as "42.50" and that the function takes as a whole number of cents keeps what is typed in React and hands the field its value with `set`. It spreads no `input`, so the browser sends nothing of its own, and writes `id`, `ref`, `aria-invalid` and `aria-describedby` from the field by hand:

```tsx
export function MoneyField({ name, label }: { name: string; label: string }) {
  const field = useField(name)
  const [typed, setTyped] = useState('')
  const take = (text: string) => {
    setTyped(text)
    const amount = Number.parseFloat(text.replace(',', '.'))
    field.set(text.trim() === '' || Number.isNaN(amount) ? undefined : Math.round(amount * 100))
  }
  return (
    <div>
      <label htmlFor={field.input.id}>{label}</label>
      <input
        id={field.input.id}
        ref={field.ref}
        inputMode="decimal"
        value={typed}
        onChange={(e) => take(e.target.value)}
        aria-invalid={field.invalid || undefined}
        aria-describedby={field.error ? field.errorId : undefined}
      />
      {field.error && <p id={field.errorId}>{field.error}</p>}
    </div>
  )
}
```

Such a control sends once the page has come alive: a visitor with no script sends the form without it.

Outside a `Form` the hook fails. A name written in place that the input does not have is `code.T6009`; a name worked out while running that it does not have holds nothing, and in development the console names it.

## Errors

`code.T6009`: a name that the function of the form does not take.

## See also

`tag.Form`, `hook.useCall`
