# T6031 consent-in-address

The state that the `consent` of a script of the head names is kept in the address. It is a warning.

## Details

A script that asks for consent is added to the page when its state is true. A state kept in the address is set by any link that holds it, so a link from anywhere would give the yes for the visitor.

```ts
state: { stats: { type: boolean(), in: 'address' } },
head: [{ script: { src: 'https://stats.example.com/s.js', consent: 'stats' } }],   // T6031
```

## The fix

Keep the state of the consent in the device, `{ type: boolean(), in: 'device' }`, so that a yes holds for the next visits, or in the screen, for a yes that holds for one visit of it.

## See also

`option.screen.head`, `option.project.head`
