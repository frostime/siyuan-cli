# Process ancestor-chain test

Agent: Codex
Platform: Windows

## Run 1

```json
{
  "probe": "caller-current-process-anchor",
  "platform": "Windows-10-10.0.19045-SP0",
  "python": "3.10.0",
  "pid": 36656,
  "ppid": 41416,
  "chain": [
    {
      "pid": 36656,
      "ppid": 41416,
      "name": "python.exe",
      "creation_ticks": 134330943949719125,
      "identity": "36656:134330943949719125",
      "identity_strength": "pid+creation-time"
    },
    {
      "pid": 41416,
      "ppid": 22608,
      "name": "pwsh.exe",
      "creation_ticks": 134330943945840030,
      "identity": "41416:134330943945840030",
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
```

## Run 2

```json
{
  "probe": "caller-current-process-anchor",
  "platform": "Windows-10-10.0.19045-SP0",
  "python": "3.10.0",
  "pid": 42636,
  "ppid": 41000,
  "chain": [
    {
      "pid": 42636,
      "ppid": 41000,
      "name": "python.exe",
      "creation_ticks": 134330943987487136,
      "identity": "42636:134330943987487136",
      "identity_strength": "pid+creation-time"
    },
    {
      "pid": 41000,
      "ppid": 22608,
      "name": "pwsh.exe",
      "creation_ticks": 134330943983521323,
      "identity": "41000:134330943983521323",
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
```

## Run 3

```json
{
  "probe": "caller-current-process-anchor",
  "platform": "Windows-10-10.0.19045-SP0",
  "python": "3.10.0",
  "pid": 29736,
  "ppid": 28568,
  "chain": [
    {
      "pid": 29736,
      "ppid": 28568,
      "name": "python.exe",
      "creation_ticks": 134330944025030088,
      "identity": "29736:134330944025030088",
      "identity_strength": "pid+creation-time"
    },
    {
      "pid": 28568,
      "ppid": 22608,
      "name": "pwsh.exe",
      "creation_ticks": 134330944021214744,
      "identity": "28568:134330944021214744",
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
```
