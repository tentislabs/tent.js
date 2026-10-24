import datetime

import numberish


def run(input, tent):
    return {
        "one": numberish.Scalar(3.5),
        "many": numberish.Array([1, 2, 3]),
        "at": datetime.datetime(2026, 10, 15, 12, 30, tzinfo=datetime.timezone.utc),
    }
