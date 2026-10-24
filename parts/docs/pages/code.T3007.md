# T3007 secret-in-browser

A secret value of this computer was found in the code that a browser loads. Everything under `browser/` of a bundle can be fetched by anyone, so the build stops and writes no bundle.

## Details

The guard of the build searches every finished browser file for each value that the build was handed with `secrets`, before a file is written. A value under 8 characters is not searched for: it would be found in code that holds no secret. The finding names the file, and never the value.

A secret reaches browser code where a screen file, or a helper file that a screen file imports, writes the value in place. A backend file never does: a screen file that imports one is handed the name, the kind and the input types of each definition, and nothing else of the file.

## The fix

Take the value out of every file that a screen file imports, and read it on the server with `secrets`, inside a query, a change or an action. A value that was once in a file that a browser loaded is no secret any more: give it a new value.

## See also

`topic.build`, `topic.screens`, `code.T1005`
