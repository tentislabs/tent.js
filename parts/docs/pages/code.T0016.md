# T0016 part-not-fetched

A part that is fetched at its first use could not be fetched. A caller gets it with the status 500.

## Details

Some parts are not in the install, and the engine fetches each the first time an app needs it: the reader for PDF files, the picture resizer, Python. The error names the part and says why:

- this computer does not reach the place the part comes from, or the fetch took longer than it is waited for: `limits.fetchTime` of the project of the call that needed the part, which is two minutes where the project states none, and two minutes for a part that is fetched outside a call. The wait still counts on the time of the call that needed the part;
- what was downloaded does not have the fingerprint that the engine pins for the part;
- the archive of the part holds a path that leaves the folder of the part or is written twice, two names that a disk reads as one, an entry under the path of a link, a hard link that names no file, or a link whose words hold a backslash, that leaves the folder at any piece of its way, that the disk cannot follow to an end, or that leads to the folder it lies in or to one above it;
- the list of the parts holds no part of that name for this system.

What was downloaded is thrown away, and nothing of the part is kept. The call that needed the part fails, and nothing else of the app is affected: the next call that needs the part fetches it again.

## The fix

See that the computer reaches the place the part comes from, and call again. Where a server may not reach it, lay the files of the parts at an address of your own and name it: `TENT_PARTS=https://parts.example.com/` in the environment of the engine. The fingerprints are still those the engine pins.

## See also

`topic.fetch`, `code.T0022`, `code.T0023`
