# `cookies` of `project`

The two marks of the engine's cookies that a project may change: which sites a cookie is sent from, and which names share it.

## Value

`{ sameSite, domain }`. `sameSite` is `'lax'` or `'none'`, and `domain` a parent name that the cookies are set for. Left out, a cookie is sent to this site alone (`SameSite=Lax`) and belongs to the one name the app was reached by.

The engine's cookies are the session (`handle.sessions`) and the visitor id. Each is named `tent_<kind>.<the app's name>`, cannot be read by the scripts of a page, and is marked `Secure` over https. Over https its name starts `__Host-`, so that a browser takes it from this very site alone.

| Stated | Does |
|---|---|
| `sameSite: 'none'` | Lets an app that is shown in a frame of another site keep its sign-in there. A browser takes such a cookie over https alone: over plain http the cookie stays `Lax` |
| `domain: 'example.com'` | Lets the names of one parent share one cookie. The name of the cookie then starts `__Secure-` and not `__Host-`, and the builder so accepts what a sister site under that parent can do. Over plain http no domain is set |

## Example

```ts
export const shop = project('shop', {
  cookies: { sameSite: 'none', domain: 'example.com' },
})
```

## See also

`word.project`, `handle.sessions`
