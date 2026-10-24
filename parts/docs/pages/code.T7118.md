# T7118 not-verified

A call coming in, or the request of a route handed to `verified`, could not be verified: its signature is wrong or missing, or its time lies too far from now.

## Details

The signature is checked over the exact bytes that arrived, before anything of them is read, and compared in constant time. A time more than `limits.incomingAge` (5 minutes) from now, in either direction, fails too, for a scheme that has a time. So do two headers of one of the scheme's names, and a time that is no number. A check of the builder's own, a scheme `{ by }`, fails with this code whatever it throws. The answer is status 401.

## The fix

Send the call as the provider signs it, with the secret the app holds, and a time near now. Where the provider changed its secret, set the new one with `tent secret set`.

## See also

`option.incoming.verify`, `word.verified`, `word.incoming`
