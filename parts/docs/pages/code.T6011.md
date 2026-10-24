# T6011 state-not-declared

`set` of a `Link` or of `then`, or the `consent` of a script of the head, names a state that is not declared or is of the wrong type, or `set` gives a literal that does not fit.

## Details

A state that a view names is declared in `state` of the screen or the component, or of the project. The `consent` of a script follows a `boolean()`, and `set` gives each state a value of its type. A name in `reset` that is no field of the form's function is a state of the view. A view and the project never declare a state of one name.

```tsx
<Link set={{ nope: true }}>Open</Link>        // T6011: nope is not declared
<Link set={{ page: 'two' }}>Two</Link>         // T6011: page is a number
```

## The fix

Declare the state, or name one that is declared, and give it a value of its type.

## See also

`tag.Link`, `tag.Form`, `option.screen.state`, `option.screen.head`
