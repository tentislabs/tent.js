import time

# A large model, loaded once with the file and held for every call after.
model = [bytearray(1024 * 1024) for _ in range(200)]


def run(input, tent):
    time.sleep(1.5)
    return len(model)
