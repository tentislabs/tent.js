import ctypes


def run(input, tent):
    # Reads the memory at address zero, as a native package that crashes does: the program ends at once.
    return ctypes.string_at(0)
