// The page of a builder's screen that a person is asked a yes on: no site shows it in a frame.
import type { PageAnswer } from './answer.ts'

/**
 * Takes a page that was drawn, and where its answer may lead where the page states another: the `form-action` of a
 * policy. Answers it as a response that no site shows in a frame, whatever the screen states.
 */
export function unframed(page: PageAnswer, formAction?: string): Response {
  const stated = String(page.headers['content-security-policy'] ?? '').replace(
    /frame-ancestors [^;]*/,
    "frame-ancestors 'none'",
  )
  const policy = formAction === undefined ? stated : stated.replace(/form-action [^;]*/, formAction)
  return new Response(page.html, {
    status: page.status,
    headers: { ...page.headers, 'content-security-policy': policy, 'x-frame-options': 'DENY' },
  })
}
