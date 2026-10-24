# T0031 record-behind

A write was refused because the place of record of the app has been behind for too long. The caller may ask again.

## Details

An app may hand every write to a copy that is its place of record: a `ChangeSink` that states `held`. A write is answered only once that sink took it. While the sink is behind, the answers wait. Once the oldest write that waits has waited for `behind` of `limits`, every new change and action is refused with this code before it begins, until the sink has taken all that waits. So the record never lacks a write that a caller was told of.

## The fix

Ask again in a moment. Where it stays, see why the place of record does not take the writes: whether it runs, and whether the machine can reach it.

## See also

`code.T0029`, `code.T0030`
