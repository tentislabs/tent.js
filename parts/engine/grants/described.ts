import type { Description } from '../../core/internal.ts'
import { isStored } from '../../core/internal.ts'

/** Every scope the app grants: `read` and `write`, and each finer scope of `mcp.scopes`. */
export function scopesOf(description: Description): string[] {
  const finer: unknown = Reflect.get(Object(description.project.mcp), 'scopes')
  return [
    'read',
    'write',
    ...Object.keys(isStored(finer) ? finer : {}).filter((one) => one !== 'read' && one !== 'write'),
  ]
}

/** The document of `/mcp`: that it is guarded, by the app, with which scopes, and that a token travels in the line alone. */
export const resourceDocument = (description: Description, origin: string): Record<string, unknown> => ({
  resource: `${origin}/mcp`,
  authorization_servers: [origin],
  scopes_supported: scopesOf(description),
  bearer_methods_supported: ['header'],
})

/**
 * The document of the sign-in: the app as the issuer, its addresses, the code way alone with renewal, the proof
 * `S256` alone, no secret of a client, clients by their own documents, the scopes, and that the return carries
 * the issuer. The address of registering stands where the project lets clients register themselves.
 */
export const signInDocument = (
  description: Description,
  origin: string,
  registers: boolean,
): Record<string, unknown> => ({
  issuer: origin,
  authorization_endpoint: `${origin}/_t/oauth/authorize`,
  token_endpoint: `${origin}/_t/oauth/token`,
  revocation_endpoint: `${origin}/_t/oauth/end`,
  ...(registers ? { registration_endpoint: `${origin}/_t/oauth/register` } : {}),
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  code_challenge_methods_supported: ['S256'],
  token_endpoint_auth_methods_supported: ['none'],
  client_id_metadata_document_supported: true,
  scopes_supported: scopesOf(description),
  authorization_response_iss_parameter_supported: true,
})
