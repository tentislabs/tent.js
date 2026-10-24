# T0006 not-signed-in

The rule needs a signed-in caller and there is none. A caller gets it with the status 401.

## Details

A caller who is nobody is answered this at every rule but `anyone`: at `'signedIn'`, at a role, at `'nobody'`, and at a rule made with `allow` that does not let them in. A signed-in caller whom the rule keeps out is answered `code.T3101`. The rule is asked before the input is looked at, so a caller who is kept out learns nothing of the types. A function that states no rule is open to nobody.

The commands of an engine are answered it too, in the words "The commands of an engine are for whoever started it.": a command of `tent` that reaches a running engine - `tent run`, `tent data`, `tent logs`, `tent access` and the others of `topic.commands` - is refused where it lacks the admin token of `engine.json`, comes from another computer, or comes through a proxy that the engine was told of. On a server, `tent runs` and `tent logs` are answered so for a key without the right `operate`. The words say nothing of which it was.

A command of this computer comes from `127.0.0.1`. Where the engine was told of a proxy at that address, as with `tent start --proxy from=127.0.0.1`, every command reaches it as a request through a proxy, and the command says so with the data folder and the program of the engine. It starts no engine of its own on that data folder then, and a second `tent start` on it is refused with `code.T0013`.

## The fix

Sign in and call again. Where everyone may call the function, state `access: anyone('why')` on it, with the reason. For a command of an engine: type it on the computer that runs the engine, as the user who started it, or reach a server with a key of the right `operate` (`command.access`). Behind a host in front on this computer, have the host reach the engine from another address of it, `127.0.0.2`, as nginx does with `proxy_bind 127.0.0.2`, and name that one in `--proxy from` in place of `127.0.0.1`: `tent start --proxy from=127.0.0.2`. Windows and Linux answer on `127.0.0.2` as they are; on macOS add it first, with `sudo ifconfig lo0 alias 127.0.0.2`. Or type the command while no engine runs on the data folder.

## See also

`code.T3101`, `word.anyone`, `word.allow`
