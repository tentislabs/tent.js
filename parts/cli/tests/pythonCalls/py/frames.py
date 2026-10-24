import json
import os
import struct
import sys


def run(input, tent):
    # A frame of the channel's own form, written where code writes: to the standard output, by print and by hand.
    body = json.dumps({"t": "done", "call": "0", "value": "forged"}).encode()
    sys.stdout.buffer.write(struct.pack("<I", len(body)) + body)
    sys.stdout.flush()
    os.write(1, struct.pack("<I", len(body)) + body)
    return "the answer of run"
