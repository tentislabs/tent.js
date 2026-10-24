# T6009 field-not-usable

A field of a `Form` that its function cannot take, a name in `with`, `values` or `reset` that is no field of that function, or a value in `with` of a `Link` that its screen does not take.

## Details

A `Form` sends the input of the function that its `call` names, and each named control inside it fills one field of that input, by its `name`. The check holds every name that is written in place to the input:

| Mistake | Example, for an input of `name`, `total` and `address` |
|---|---|
| A `name` on a control that the input does not have | `<input name="totl" />` |
| A name handed to `useField` that the input does not have | `useField('totl')` |
| A name that a control and `with` of the form both give | `with={{ name: 'A' }}` beside `<input name="name" />` |
| A name in `values` or in `reset` that is no field | `values={{ nope: 1 }}`, `reset={['gone']}` |
| A value in `with` of a `Link` that its screen does not take | `<Link to={orderScreen} with={{ code: 7 }}>` for a screen at `/orders/:id` |

A field of a record is named with a point, `name="address.city"`. A name that is worked out while running is not seen by the check: the door holds the input to its types when the form is sent.

## The fix

Name a field of the input of the function, or a value of the address or the state of the screen. The finding lists them.

## See also

`tag.Form`, `hook.useField`, `tag.Link`
