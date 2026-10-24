# T6030 public-reads-visitor

A screen whose `cache` states `public` reads `user`, or a state kept in the device. A warning.

## Details

A screen kept as `public` may be kept by a cache outside the engine, which hands every visitor the copy that was drawn for nobody. Such a screen reads neither the user nor a state kept in the device in its own view, nor calls `useUser`. A component it uses may read either where it states `personal: true`: it is a personal part, which the copy does not hold and the page draws once it has come alive (`option.component.personal`).

```tsx
cache: { for: 60_000, public: true },
view: ({ user }) => <p>{user ? user.id : ''}</p>,   // T6030
```

## The fix

Take `public` away from `cache`, read neither the user nor a state kept in the device, or move what reads them into a component that states `personal: true`.

## See also

`option.screen.cache`, `option.component.personal`
