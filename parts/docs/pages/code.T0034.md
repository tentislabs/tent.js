# T0034 engines-differ

A reader and its writer run stores of two shape numbers. The writer refuses the link, and both logs say so.

## Details

Every machine of an app runs a store of one shape number. A reader tells its number when it opens the link, and a writer of another number answers `no` with this code. A reader never upgrades the shape of the tables of a data file by itself.

## The fix

Run one engine on every machine. Update the writer first, and the readers then.

## See also

`code.T0029`, `command.machines`
