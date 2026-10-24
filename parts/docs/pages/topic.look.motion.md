# Motion

Motion is CSS - a `transition`, an `@keyframes` - or a library, as Motion for React. A move between screens inside the page is drawn inside the browser's own view transition by itself: the page code hands each move to `document.startViewTransition`, where the browser has it and the viewer did not ask for less motion, so `view-transition-name` on what should carry over is all a screen writes. A WebKit engine - Safari, and a desktop window of Tauri on macOS - is handed no view transition, as for less motion, since WebKit can end its page in one between a page that fits the window and a taller one: there the screens change at once. `@view-transition { navigation: auto; }` in a style file asks the same of a move between two whole documents, as a link that loads its page whole. A style names `@media (prefers-reduced-motion: reduce)` for a viewer who asked for less.

A component that draws on a `<canvas>` holds it by a ref, and draws in an effect, which runs once the page has come alive: the first HTML holds the empty canvas, at the size it states, so nothing moves when the drawing starts. The effect answers its clean-up, which React runs when the component leaves the page, as on a move to a screen that does not draw it, so no frame is drawn after:

```tsx
// components/Stars.tsx
import { useEffect, useRef } from 'react'
import { component } from 'tentjs/ui'

export const Stars = component('Stars', {
  view: () => {
    const canvas = useRef<HTMLCanvasElement>(null)
    useEffect(() => {
      const drawn = canvas.current?.getContext('2d')
      if (!drawn) return undefined
      let frame = requestAnimationFrame(function draw(at) {
        drawn.clearRect(0, 0, 320, 160)
        drawn.fillRect(156 + Math.sin(at / 500) * 120, 76, 8, 8)
        frame = requestAnimationFrame(draw)
      })
      return () => cancelAnimationFrame(frame)
    }, [])
    return <canvas ref={canvas} width={320} height={160} aria-hidden="true" />
  },
})
```

Such a component lives in the browser, so it never states `browser: false` (`code.T6018`). One that should stand still for a viewer who asked for less motion reads `matchMedia('(prefers-reduced-motion: reduce)')` in its effect and draws one frame.
