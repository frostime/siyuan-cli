Platform: Codex / Windows

=== Run 1 stdout ===
{
  "probe": "caller-current-process-anchor",
  "platform": "Windows-10-10.0.19045-SP0",
  "python": "3.10.0",
  "pid": 37400,
  "ppid": 3068,
  "chain": [
    {
      "pid": 37400,
      "ppid": 3068,
      "name": "python.exe",
      "creation_ticks": 134330934721041223,
      "identity": "37400:134330934721041223",
      "identity_strength": "pid+creation-time"
    },
    {
      "pid": 3068,
      "ppid": 22608,
      "name": "pwsh.exe",
      "creation_ticks": 134330934679073830,
      "identity": "3068:134330934679073830",
      "identity_strength": "pid+creation-time"
    },
    {
      "pid": 22608,
      "ppid": 21092,
      "name": "codex.exe",
      "creation_ticks": 134330761740449810,
      "identity": "22608:134330761740449810",
      "identity_strength": "pid+creation-time"
    },
    {
      "pid": 21092,
      "ppid": 8260,
      "name": "ChatGPT.exe",
      "creation_ticks": 134330760902186250,
      "identity": "21092:134330760902186250",
      "identity_strength": "pid+creation-time"
    },
    {
      "pid": 8260,
      "ppid": 7148,
      "name": "explorer.exe",
      "creation_ticks": 134329770462362777,
      "identity": "8260:134329770462362777",
      "identity_strength": "pid+creation-time"
    }
  ],
  "note": "Run once per independent caller/tool invocation; compare shared identity values."
}

=== Run 2 stdout ===
{
  "probe": "caller-current-process-anchor",
  "platform": "Windows-10-10.0.19045-SP0",
  "python": "3.10.0",
  "pid": 16352,
  "ppid": 37400,
  "chain": [
    {
      "pid": 16352,
      "ppid": 37400,
      "name": "python.exe",
      "creation_ticks": 134330934781985189,
      "identity": "16352:134330934781985189",
      "identity_strength": "pid+creation-time"
    },
    {
      "pid": 37400,
      "ppid": 22608,
      "name": "pwsh.exe",
      "creation_ticks": 134330934770715946,
      "identity": "37400:134330934770715946",
      "identity_strength": "pid+creation-time"
    },
    {
      "pid": 22608,
      "ppid": 21092,
      "name": "codex.exe",
      "creation_ticks": 134330761740449810,
      "identity": "22608:134330761740449810",
      "identity_strength": "pid+creation-time"
    },
    {
      "pid": 21092,
      "ppid": 8260,
      "name": "ChatGPT.exe",
      "creation_ticks": 134330760902186250,
      "identity": "21092:134330760902186250",
      "identity_strength": "pid+creation-time"
    },
    {
      "pid": 8260,
      "ppid": 7148,
      "name": "explorer.exe",
      "creation_ticks": 134329770462362777,
      "identity": "8260:134329770462362777",
      "identity_strength": "pid+creation-time"
    }
  ],
  "note": "Run once per independent caller/tool invocation; compare shared identity values."
}

=== Run 3 stdout ===
{
  "probe": "caller-current-process-anchor",
  "platform": "Windows-10-10.0.19045-SP0",
  "python": "3.10.0",
  "pid": 36656,
  "ppid": 14044,
  "chain": [
    {
      "pid": 36656,
      "ppid": 14044,
      "name": "python.exe",
      "creation_ticks": 134330934897144015,
      "identity": "36656:134330934897144015",
      "identity_strength": "pid+creation-time"
    },
    {
      "pid": 14044,
      "ppid": 22608,
      "name": "pwsh.exe",
      "creation_ticks": 134330934886182447,
      "identity": "14044:134330934886182447",
      "identity_strength": "pid+creation-time"
    },
    {
      "pid": 22608,
      "ppid": 21092,
      "name": "codex.exe",
      "creation_ticks": 134330761740449810,
      "identity": "22608:134330761740449810",
      "identity_strength": "pid+creation-time"
    },
    {
      "pid": 21092,
      "ppid": 8260,
      "name": "ChatGPT.exe",
      "creation_ticks": 134330760902186250,
      "identity": "21092:134330760902186250",
      "identity_strength": "pid+creation-time"
    },
    {
      "pid": 8260,
      "ppid": 7148,
      "name": "explorer.exe",
      "creation_ticks": 134329770462362777,
      "identity": "8260:134329770462362777",
      "identity_strength": "pid+creation-time"
    }
  ],
  "note": "Run once per independent caller/tool invocation; compare shared identity values."
}
