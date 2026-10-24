/** The return address with what the standard sends back: the code or the refusal, the client's state, and the issuer. */
export function backTo(redirect: string, fields: Record<string, string>, origin: string): string {
  const url = new URL(redirect)
  for (const [name, value] of Object.entries(fields)) if (value !== '') url.searchParams.set(name, value)
  url.searchParams.set('iss', origin)
  return url.toString()
}

/** An answer that sends the person back, which no cache keeps. */
export const sentBack = (to: string): Response =>
  new Response(null, { status: 303, headers: { location: to, 'cache-control': 'no-store' } })
