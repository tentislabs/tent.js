/** What a request carries as `Authorization: Bearer <secret>`, or an empty text. */
export const bearerOf = (request: Request): string =>
  /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1] ?? ''
