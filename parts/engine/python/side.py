# Our side of a Python program of the engine. It uses Python's standard library alone, and everything it needs is
# imported before the files of the project are put on the path, so a project file named like a part of Python
# stands in front of nothing of ours. The room of the app starts it with the channel as its standard input (in) and
# output (out): frames of four bytes of length, the lowest first, and one JSON value.
import asyncio
import ctypes
import datetime
import importlib
import importlib.util
import inspect
import json
import math
import os
import pathlib
import sqlite3
import struct
import sys
import threading
import time
import tokenize
import traceback
import urllib.parse

# What the standard library would load late, on its first use, is loaded now, before the project's folders.
try:
    import resource
except ImportError:
    resource = None
try:
    import _colorize
except ImportError:
    pass

# The channel is moved to the numbers 3 (in) and 4 (out) before any code of the project runs, which a program this
# one starts does not inherit: the standard input is then nothing and the standard output the error stream, so
# neither code that reads the input nor a print, of Python or of a native package, touches the channel. The numbers
# are named, not the lowest free ones: on Linux the runtime may hold one of those, and the channel stands where the
# engine's side of Python says it stands.
CHANNEL_IN, CHANNEL_OUT = 3, 4
os.dup2(0, CHANNEL_IN, inheritable=False)
os.dup2(1, CHANNEL_OUT, inheritable=False)
_nothing = os.open(os.devnull, os.O_RDONLY)
os.dup2(_nothing, 0)
os.close(_nothing)
os.dup2(2, 1)


def hold_started():
    """On Windows this program stands in a job of its own, which ends every program in it once this one has ended."""
    if os.name != "nt":
        return None

    class Basic(ctypes.Structure):
        _fields_ = [
            ("PerProcessUserTimeLimit", ctypes.c_int64),
            ("PerJobUserTimeLimit", ctypes.c_int64),
            ("LimitFlags", ctypes.c_uint32),
            ("MinimumWorkingSetSize", ctypes.c_size_t),
            ("MaximumWorkingSetSize", ctypes.c_size_t),
            ("ActiveProcessLimit", ctypes.c_uint32),
            ("Affinity", ctypes.c_size_t),
            ("PriorityClass", ctypes.c_uint32),
            ("SchedulingClass", ctypes.c_uint32),
        ]

    class Extended(ctypes.Structure):
        _fields_ = [
            ("BasicLimitInformation", Basic),
            ("IoInfo", ctypes.c_uint64 * 6),
            ("ProcessMemoryLimit", ctypes.c_size_t),
            ("JobMemoryLimit", ctypes.c_size_t),
            ("PeakProcessMemoryUsed", ctypes.c_size_t),
            ("PeakJobMemoryUsed", ctypes.c_size_t),
        ]

    kernel = ctypes.windll.kernel32
    kernel.CreateJobObjectW.restype = ctypes.c_void_p
    kernel.CreateJobObjectW.argtypes = [ctypes.c_void_p, ctypes.c_wchar_p]
    kernel.SetInformationJobObject.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_void_p, ctypes.c_uint32]
    kernel.GetCurrentProcess.restype = ctypes.c_void_p
    kernel.AssignProcessToJobObject.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
    job = kernel.CreateJobObjectW(None, None)
    info = Extended()
    # Every program in the job is ended when its last handle closes: this program holds the one handle.
    info.BasicLimitInformation.LimitFlags = 0x2000
    kernel.SetInformationJobObject(job, 9, ctypes.byref(info), ctypes.sizeof(info))
    kernel.AssignProcessToJobObject(job, kernel.GetCurrentProcess())
    return job


STARTED_JOB = hold_started()


def end_now(code):
    """Ends this program with every program its code started: on macOS and Linux they stand in its group."""
    if os.name != "nt":
        try:
            os.killpg(os.getpgrp(), 9)
        except OSError:
            pass
    os._exit(code)

FRAME_SIZE = int(sys.argv[1]) if len(sys.argv) > 1 else 16 * 1024 * 1024
write_lock = threading.Lock()


def send(value):
    body = json.dumps(value, allow_nan=False).encode()
    out = struct.pack("<I", len(body)) + body
    with write_lock:
        while out:
            written = os.write(CHANNEL_OUT, out)
            out = out[written:]


PRINTED = b"\x1f"


class Printed:
    """What a print of Python writes to: each whole line goes to the error stream, marked as the program's output."""

    def __init__(self):
        self._held = ""
        self._lock = threading.Lock()
        self.buffer = sys.__stderr__.buffer
        self.encoding = "utf-8"

    def write(self, text):
        # The mark leads the line, which the engine logs as output and not as an error: the channel is never touched.
        with self._lock:
            self._held += text
            *whole, self._held = self._held.split("\n")
            for line in whole:
                out = PRINTED + line.encode("utf-8", "replace") + b"\n"
                while out:
                    out = out[os.write(2, out):]
        return len(text)

    def flush(self):
        pass

    def isatty(self):
        return False

    def fileno(self):
        # What writes to the number itself, as a native package does, writes to the error stream.
        return 2


sys.stdout = Printed()


def read_exactly(n):
    data = b""
    while len(data) < n:
        part = os.read(CHANNEL_IN, n - len(data))
        if not part:
            return None
        data += part
    return data


# The memory this program holds, as the system counts it: what is resident, on each of the three systems.
def memory_now():
    try:
        if sys.platform == "win32":
            class Counters(ctypes.Structure):
                _fields_ = [
                    ("cb", ctypes.c_uint32),
                    ("PageFaultCount", ctypes.c_uint32),
                    ("PeakWorkingSetSize", ctypes.c_size_t),
                    ("WorkingSetSize", ctypes.c_size_t),
                    ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                    ("PagefileUsage", ctypes.c_size_t),
                    ("PeakPagefileUsage", ctypes.c_size_t),
                ]
            counters = Counters()
            counters.cb = ctypes.sizeof(Counters)
            kernel = ctypes.windll.kernel32
            kernel.GetCurrentProcess.restype = ctypes.c_void_p
            kernel.K32GetProcessMemoryInfo.argtypes = [ctypes.c_void_p, ctypes.POINTER(Counters), ctypes.c_uint32]
            kernel.K32GetProcessMemoryInfo(kernel.GetCurrentProcess(), ctypes.byref(counters), counters.cb)
            return int(counters.WorkingSetSize)
        if sys.platform == "darwin":
            info = (ctypes.c_uint64 * 12)()
            libproc = ctypes.CDLL("/usr/lib/libproc.dylib")
            # PROC_PIDTASKINFO: its second number is the resident size.
            libproc.proc_pidinfo(os.getpid(), 4, ctypes.c_uint64(0), ctypes.byref(info), ctypes.sizeof(info))
            return int(info[1])
        with open("/proc/self/statm") as statm:
            return int(statm.read().split()[1]) * os.sysconf("SC_PAGE_SIZE")
    except Exception:
        return int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss) * 1024 if resource else 0


class Fail(Exception):
    """The app's own failure, which the caller sees: a code of the builder's own, words, and fields."""

    def __init__(self, code, message, fields=None):
        super().__init__(message)
        self.code, self.message, self.fields = code, message, fields or {}


class Error(Exception):
    """A call through tent.call that failed: its code, its words and its fields, as the engine told them."""

    def __init__(self, code, message, fields=None, wire=None):
        super().__init__(message)
        self.code, self.message, self.fields, self.wire = code, message, fields or {}, wire


class Back(Exception):
    """Work that hands itself back, to be given again from its kept progress."""


class Unplain(Exception):
    def __init__(self, field):
        super().__init__(field)
        self.field = field


def plain(value, field="value"):
    """A value as JSON holds it: a value's own plain form where it has one, a date as text in the standard form."""
    if value is None or isinstance(value, (bool, str)):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            raise Unplain(field)
        return value
    if isinstance(value, datetime.datetime):
        moment = value if value.tzinfo else value.replace(tzinfo=datetime.timezone.utc)
        moment = moment.astimezone(datetime.timezone.utc)
        return moment.strftime("%Y-%m-%dT%H:%M:%S.") + f"{moment.microsecond // 1000:03d}Z"
    if isinstance(value, datetime.date):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): plain(one, f"{field}.{key}") for key, one in value.items()}
    if isinstance(value, (list, tuple)):
        return [plain(one, f"{field}.{at}") for at, one in enumerate(value)]
    for name in ("tolist", "item"):
        member = getattr(value, name, None)
        if callable(member):
            return plain(member(), field)
    raise Unplain(field)


# The calls that the engine told to stop: a stop is of its call alone, and goes with it.
stopped = set()
connections = {}
asks = {}
asks_lock = threading.Lock()
next_ask = [0]


def ask(call, what, **more):
    """Asks the engine for something on behalf of a call, and waits for its answer."""
    with asks_lock:
        next_ask[0] += 1
        number = next_ask[0]
        waiting = asks[number] = {"done": threading.Event()}
    send({"t": "ask", "ask": number, "call": call, "what": what, **more})
    waiting["done"].wait()
    with asks_lock:
        del asks[number]
    if "error" in waiting:
        error = waiting["error"]
        raise Error(error.get("code"), error.get("message", ""), error.get("fields"), error)
    return waiting.get("value")


class Entry:
    """One entry of a call: its input, its rows, its folder, and what it calls, as its caller."""

    def __init__(self, call, given, at=None):
        self.call_id = call
        self.at = at
        self.input = given.get("input")
        self.folder = given.get("folder")
        self.rows_file = given.get("rows")

    def db(self):
        if not self.rows_file:
            raise Error("T0013", "This python states no `rows`: its `tent.db()` holds no table.")
        # The address is made here: `as_uri` loads parts of Python late, where a project file may stand in front.
        posix = pathlib.Path(self.rows_file).resolve().as_posix()
        address = "file:" + ("///" if os.name == "nt" else "//") + urllib.parse.quote(posix, safe="/:")
        opened = sqlite3.connect(address + "?mode=ro", uri=True, check_same_thread=False)
        # Every connection of a call is closed when the call ends: its folder is removed then.
        connections.setdefault(self.call_id, []).append(opened)
        return opened

    def call(self, name, input=None):
        given = plain(input if input is not None else {}, "input")
        return ask(self.call_id, "call", name=name, input=given, entry=self.at)

    def file(self, id):
        return ask(self.call_id, "file", id=id, entry=self.at)


class Tent:
    """What `run` is handed beside its input."""

    Fail, Error, Back = Fail, Error, Back

    def __init__(self, call, given, batch):
        self._entry = None if batch else Entry(call, given)
        self._call = call
        self.folder = given.get("folder")
        self.disk = given.get("disk")
        self._progress = given.get("progress")
        self._step = given.get("step", False)

    def _one(self, member):
        if self._entry is None:
            raise Error("T0013", f"`tent.{member}` of a batch is the member of an entry: `entry.{member}`.")
        return self._entry

    def db(self):
        return self._one("db").db()

    def call(self, name, input=None):
        return self._one("call").call(name, input)

    def file(self, id):
        return self._one("file").file(id)

    def save_progress(self, value):
        if not self._step:
            return None
        value = plain(value, "progress")
        ask(self._call, "progress", value=value)
        self._progress = value
        return None

    def progress(self):
        return self._progress if self._step else None

    def stopping(self):
        return self._call in stopped

    def say(self, value):
        send({"t": "say", "call": self._call, "value": plain(value, "said")})

    def log(self, message):
        send({"t": "log", "call": self._call, "message": str(message)})


modules = {}
load_lock = threading.Lock()


def load(file, root):
    """Loads the file of a definition once: by its dotted name where it has one, so that its imports work."""
    with load_lock:
        return loaded_module(file, root)


def of_bundle(module):
    """Whether a loaded module is a file of the bundle: one that lies under a folder that the engine put on the path."""
    places = [getattr(module, "__file__", None) or "", *list(getattr(module, "__path__", []) or [])]
    folders = [os.path.normcase(os.path.abspath(one)) + os.sep for one in sys.argv[2:]]
    return any(os.path.normcase(os.path.abspath(place)).startswith(tuple(folders)) for place in places if place)


def loaded_module(file, root):
    if file in modules:
        return modules[file]
    path = os.path.join(root, *file.split("/"))
    pieces = file[: -len(".py")].split("/")
    # A name that a module of Python's own already holds, as json, is loaded by its path: the name would hand ours.
    taken = pieces[0] in sys.modules and not of_bundle(sys.modules[pieces[0]])
    if all(piece.isidentifier() for piece in pieces) and not taken:
        module = importlib.import_module(".".join(pieces))
    else:
        spec = importlib.util.spec_from_file_location("tent_file_" + str(len(modules)), path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    modules[file] = module
    return module


# What each call in the program used of the processor, shared over the stretches in which calls overlapped.
use_lock = threading.Lock()
in_program = {}
last_reading = [time.process_time(), 0.0]
held_from = [None]


def booked():
    """Shares the processor time since the last reading among the calls in the program then, and answers the rest."""
    now = time.process_time()
    spent = (now - last_reading[0]) * 1000
    last_reading[0] = now
    if in_program:
        for one in in_program.values():
            one["cpu"] += spent / len(in_program)
        return 0.0
    last_reading[1] += spent
    return spent


def entered(call, memory_limit):
    with use_lock:
        booked()
        if not in_program:
            held_from[0] = memory_now()
        in_program[call] = {"cpu": 0.0, "limit": memory_limit}


def left(call):
    with use_lock:
        booked()
        one = in_program.pop(call, {"cpu": 0.0})
        return round(one["cpu"], 3)


def watch():
    """Once a second while a call is in the program, and once when it falls idle: the processor time and the memory."""
    was_busy = False
    while True:
        time.sleep(1)
        with use_lock:
            idle_spent = booked()
            busy = bool(in_program)
            memory = memory_now()
            calls = {key: round(one["cpu"], 3) for key, one in in_program.items()}
            limits = [one["limit"] for one in in_program.values() if one["limit"]]
            added = memory - (held_from[0] or memory)
        if busy or was_busy:
            send({"t": "reading", "cpuMs": round(last_reading[1], 3), "memory": memory, "calls": calls})
        was_busy = busy
        if busy and limits and added > min(limits):
            send({"t": "memory", "calls": list(calls), "limit": min(limits), "added": added})
            end_now(137)


def failure(error, call):
    if isinstance(error, Fail):
        try:
            fields = plain(error.fields, "fields")
        except Unplain:
            fields = {}
        return {"kind": "fail", "code": str(error.code), "message": str(error.message), "fields": fields}
    if isinstance(error, Back):
        return {"kind": "back"}
    if isinstance(error, Error) and error.wire is not None:
        return {"kind": "wire", "error": error.wire}
    if isinstance(error, Error):
        return {"kind": "tent", "code": error.code, "message": error.message}
    if isinstance(error, Unplain):
        return {"kind": "plain", "field": error.field}
    return {"kind": "error", "message": f"{type(error).__name__}: {error}", "trace": traceback.format_exc()}


loop = [None]


def closed(call):
    """Closes every connection of a call to its rows file: its folder is removed once the engine is told it ended."""
    stopped.discard(call)
    for opened in connections.pop(call, []):
        opened.close()


def carried(given):
    call = given["call"]
    batch = given.get("batch", False)
    entered(call, given.get("memory"))
    try:
        module = load(given["file"], given["root"])
        run = getattr(module, "run")
        tent = Tent(call, given, batch)
        handed = [Entry(call, one, at) for at, one in enumerate(given["entries"])] if batch else given.get("input")
        if inspect.iscoroutinefunction(run):
            if loop[0] is None:
                loop[0] = asyncio.new_event_loop()
                threading.Thread(target=loop[0].run_forever, daemon=True).start()
            answer = asyncio.run_coroutine_threadsafe(run(handed, tent), loop[0]).result()
        else:
            answer = run(handed, tent)
        if batch:
            entries = []
            for at, one in enumerate(answer):
                entries.append(failure(one, call) if isinstance(one, BaseException) else {"value": plain(one, f"value.{at}")})
            closed(call)
            send({"t": "done", "call": call, "entries": entries, "cpuMs": left(call)})
        else:
            value = plain(answer)
            closed(call)
            send({"t": "done", "call": call, "value": value, "cpuMs": left(call)})
    except BaseException as error:
        closed(call)
        send({"t": "failed", "call": call, "error": failure(error, call), "cpuMs": left(call)})


def loaded(given):
    try:
        load(given["file"], given["root"])
        send({"t": "loaded", "load": given["load"]})
    except BaseException as error:
        send({"t": "failed", "load": given["load"], "error": failure(error, None)})


def main():
    for folder in reversed(sys.argv[2:]):
        sys.path.insert(0, folder)
    threading.Thread(target=watch, daemon=True).start()
    send({"t": "ready", "pid": os.getpid()})
    while True:
        head = read_exactly(4)
        if head is None:
            break
        (length,) = struct.unpack("<I", head)
        if length > FRAME_SIZE:
            break
        body = read_exactly(length)
        if body is None:
            break
        message = json.loads(body)
        kind = message.get("t")
        if kind == "call":
            threading.Thread(target=carried, args=(message,), daemon=True).start()
        elif kind == "load":
            threading.Thread(target=loaded, args=(message,), daemon=True).start()
        elif kind == "answer":
            with asks_lock:
                waiting = asks.get(message.get("ask"))
            if waiting is not None:
                waiting.update({key: message[key] for key in ("value", "error") if key in message})
                waiting["done"].set()
        elif kind == "stop":
            stopped.add(message.get("call"))
    # The channel ended: the engine is gone or ended this program, which ends now with every thread of it.
    end_now(0)


main()
