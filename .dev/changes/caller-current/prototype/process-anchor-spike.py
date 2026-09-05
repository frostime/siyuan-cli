#!/usr/bin/env python3
"""Capture the current process ancestry for the caller-current design spike.

Run this script once per independent tool call. It writes one JSON document to
stdout and nothing else. Compare the `chain` arrays from multiple runs: the
nearest common process is the first shared fingerprint when walking upward.

This is an experiment, not production code. It intentionally does not infer
which process is an Agent or apply a shared-process denylist.
"""

from __future__ import annotations

import json
import os
import platform
import sys
from pathlib import Path
from typing import Any


def linux_process(pid: int) -> dict[str, Any] | None:
    """Read Linux process identity and parent from /proc."""
    try:
        stat = (Path("/proc") / str(pid) / "stat").read_text()
        # The command name may contain spaces and parentheses. The final ') '
        # before the state field is the reliable delimiter for this format.
        close = stat.rfind(") ")
        fields = stat[close + 2 :].split()
        # After pid and comm, fields[0] is state and fields[1] is ppid.
        return {
            "pid": pid,
            "ppid": int(fields[1]),
            "name": stat[stat.find("(") + 1 : close],
            # Linux starttime (clock ticks since boot) distinguishes PID reuse
            # while the process table remains observable.
            "starttime_ticks": int(fields[19]),
            "identity": f"{pid}:{fields[19]}",
        }
    except (FileNotFoundError, PermissionError, ValueError, IndexError):
        return None


def windows_process_table() -> dict[int, dict[str, Any]]:
    """Read the Windows process table through Toolhelp32Snapshot."""
    import ctypes
    import ctypes.wintypes as wintypes

    class ProcessEntry32W(ctypes.Structure):
        _fields_ = [
            ("dwSize", wintypes.DWORD),
            ("cntUsage", wintypes.DWORD),
            ("th32ProcessID", wintypes.DWORD),
            ("th32DefaultHeapID", ctypes.c_size_t),
            ("th32ModuleID", wintypes.DWORD),
            ("cntThreads", wintypes.DWORD),
            ("th32ParentProcessID", wintypes.DWORD),
            ("pcPriClassBase", wintypes.LONG),
            ("dwFlags", wintypes.DWORD),
            ("szExeFile", wintypes.WCHAR * 260),
        ]

    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    snapshot = kernel32.CreateToolhelp32Snapshot(0x00000002, 0)
    invalid = ctypes.c_void_p(-1).value
    if snapshot == invalid:
        raise OSError("CreateToolhelp32Snapshot failed")

    entry = ProcessEntry32W()
    entry.dwSize = ctypes.sizeof(entry)
    table: dict[int, dict[str, Any]] = {}
    try:
        first = kernel32.Process32FirstW(snapshot, ctypes.byref(entry))
        while first:
            pid = int(entry.th32ProcessID)
            table[pid] = {"pid": pid, "ppid": int(entry.th32ParentProcessID), "name": entry.szExeFile}
            first = kernel32.Process32NextW(snapshot, ctypes.byref(entry))
    finally:
        kernel32.CloseHandle(snapshot)

    # Add a creation-time fingerprint. A PID alone is not stable after reuse.
    query_limited = 0x1000
    open_process = kernel32.OpenProcess
    get_times = kernel32.GetProcessTimes
    for pid, item in table.items():
        handle = open_process(query_limited, False, pid)
        if not handle:
            item["identity"] = str(pid)
            item["identity_strength"] = "pid-only"
            continue
        try:
            creation = wintypes.FILETIME()
            exit_time = wintypes.FILETIME()
            kernel_time = wintypes.FILETIME()
            user_time = wintypes.FILETIME()
            if get_times(handle, ctypes.byref(creation), ctypes.byref(exit_time), ctypes.byref(kernel_time), ctypes.byref(user_time)):
                ticks = (creation.dwHighDateTime << 32) | creation.dwLowDateTime
                item["creation_ticks"] = ticks
                item["identity"] = f"{pid}:{ticks}"
                item["identity_strength"] = "pid+creation-time"
            else:
                item["identity"] = str(pid)
                item["identity_strength"] = "pid-only"
        finally:
            kernel32.CloseHandle(handle)
    return table


def ancestry() -> list[dict[str, Any]]:
    system = platform.system().lower()
    chain: list[dict[str, Any]] = []
    seen: set[int] = set()
    pid = os.getpid()
    table = None if system == "linux" else windows_process_table() if system == "windows" else {}

    while pid and pid not in seen:
        seen.add(pid)
        item = linux_process(pid) if system == "linux" else table.get(pid) if table else None
        if item is None:
            break
        chain.append(item)
        pid = int(item["ppid"])
    return chain


def main() -> None:
    chain = ancestry()
    result = {
        "probe": "caller-current-process-anchor",
        "platform": platform.platform(),
        "python": sys.version.split()[0],
        "pid": os.getpid(),
        "ppid": os.getppid(),
        "chain": chain,
        "note": "Run once per independent caller/tool invocation; compare shared identity values.",
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
