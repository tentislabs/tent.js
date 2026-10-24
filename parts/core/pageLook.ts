const muted = 'light-dark(#71717a,#a1a1aa)'
const line = 'light-dark(#e4e4e7,#27272a)'
const mono = 'ui-monospace,"SF Mono",Consolas,monospace'

/**
 * The one look of the engine's own pages and of the built-in screens of the page code, by their parts, each the
 * declarations of one element: in the middle of the window, the status large, its words under it, and one link;
 * in the modes `development` and `test` the code of the error in a small pill, and its place and words under it.
 * Light and dark follow the device through `light-dark()`, which an element's own `style` reads as a style sheet
 * does, so a built-in screen carries the look inside any app's page. A page that asks a person something takes
 * `heading`, `text` and `press` beside them.
 */
export const pageLook = {
  window:
    'box-sizing:border-box;min-height:100vh;margin:0;padding:24px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color-scheme:light dark;background:light-dark(#fff,#0a0a0a);color:light-dark(#18181b,#fafafa);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
  status: 'margin:0;font-size:44px;line-height:1.1;font-weight:600;letter-spacing:-.03em',
  words: `margin:4px 0 0;font-size:15px;font-weight:400;color:${muted}`,
  code: `display:inline-block;margin-top:18px;padding:4px 10px;border-radius:999px;border:1px solid ${line};background:light-dark(#f4f4f5,#18181b);color:${muted};font:12px ${mono}`,
  told: `max-width:36rem;margin:14px auto 0;text-align:left;white-space:pre-wrap;font:12px/1.5 ${mono};color:${muted}`,
  link: 'display:block;margin-top:18px;font-size:14px;color:inherit',
  heading: 'margin:0;font-size:22px;font-weight:600;letter-spacing:-.01em',
  text: `margin:14px 0 0;font-size:14px;line-height:1.5;color:${muted}`,
  press: `font:inherit;font-size:14px;padding:8px 14px;border-radius:8px;border:1px solid ${line};background:none;color:inherit;margin:18px 4px 0;cursor:pointer`,
} as const

/** Takes the kind of a page of status. Answers where its one link leads: back to the start, or to the same address again. */
export const pageLink = (kind: string): 'start' | 'again' =>
  kind === 'notFound' || kind === 'signIn' ? 'start' : 'again'
