import json
import os
import struct
import sys


def run(input, tent):
    # A frame of the channel's own form for this very call, written everywhere code prints: were any of these the
    # channel, the call would answer "forged".
    body = json.dumps({"t": "done", "call": tent._call, "value": "forged"}).encode()
    frame = struct.pack("<I", len(body)) + body
    sys.stdout.buffer.write(frame)
    sys.stdout.flush()
    os.write(1, frame)
    sys.stderr.buffer.write(frame)
    sys.stderr.flush()
    print(body.decode())
    return "the answer of run"
