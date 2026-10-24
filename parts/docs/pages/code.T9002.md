# T9002 missing-asset

A definition names an asset by a written name, and no file of that name lies under `assets/`. Every file under `assets/` is an asset, named by its path there.

## Details

An entry of `assets/` that is a link is an asset only where it leads to a file inside `assets/`. A link that leads to a folder, to nothing, or out of `assets/` - to a backend file of the project, to a file that a build made, to a place outside the project - is this code too, and nothing of what it leads to is read into the bundle: a file of the computer never becomes a file that a browser can load because a link points at it.

## The fix

Put the file itself into `assets/`, or name an asset that is there: `asset('logo.png')` names `assets/logo.png`.

## See also

`word.asset`, `topic.check`
