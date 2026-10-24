# T6015 cannot-cache

`cache` on a screen that is not open to anyone, or one of whose `data` entries is not.

## Details

The engine keeps a screen that states `cache` for nobody, so every entry it reads is the same for everyone: a screen that is open to `'anyone'`, whose entries read what anyone may read. A member of an agent and `working` are never the same for every visitor. A component that the screen uses may read what is a visitor's own: it is a personal part, drawn for each visitor and never kept (`option.component.personal`).

```ts
cache: 60_000,
data: { orders: read(openOrders) },   // T6015 where openOrders is for signed-in callers
```

## The fix

Read only what is open to `'anyone'` on a screen that is kept, or take `cache` away.

## See also

`option.screen.cache`, `option.component.personal`
