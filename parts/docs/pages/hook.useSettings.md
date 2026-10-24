# `useSettings`

Answers the settings of the project that are marked `public`, in the code of a view. A view is handed the same as `settings`.

## Example

```tsx
import { component, useSettings } from 'tentjs/ui'

export const Help = component('Help', {
  view: () => {
    const settings = useSettings()
    return <p>Write to {settings.supportEmail}</p>
  },
})
```

## Returns

A record of the settings that `project` marks `public: true`, each by its name. A setting that is not marked so never reaches a browser.

## See also

`handle.settings`, `hook.useUser`
