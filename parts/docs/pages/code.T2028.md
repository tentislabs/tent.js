# T2028 no-archive

What the app wrote cannot be read back: its archive of every change is off.

## Details

The archive keeps every committed change of every data file, in order (`option.project.backups`). Without it the engine cannot tell what stood at a moment, so it refuses:

- `tent data restore --at`, which brings the data to a moment from a backup and the changes after it;
- `undo`, which reads what a run, a grant or a key wrote from the record of each change.

## The fix

Take `archive: false` out of `backups` of the project. The archive then reaches back to the first backup that is taken after it is on.

## See also

`option.project.backups`, `command.data`
