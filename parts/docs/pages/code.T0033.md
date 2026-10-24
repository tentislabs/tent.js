# T0033 copy-clash

A change of the writer does not fit the data of the reader it is applied to. The reader holds nothing of that change.

## Details

Two things are held for every change. Its running fingerprint, which is worked out from the fingerprint before it and the record of the change, must be the one the reader works out itself. And each row that the record expects must be held as the record expects it: a data file that was changed by hand, or by another program, is held otherwise.

## The fix

Move the data file of the reader aside and let it fetch the data anew from its writer. No program but the engine writes a data file.

## See also

`adapter.Store`, `code.T0013`
