# Process ancestor-chain test report

Agent: Codex
Platform: Windows PowerShell on Windows 10 (10.0.19045)

## Run 1 stdout

```text
{
  "probe": "caller-current-process-anchor",
  "platform": "Windows-10-10.0.19045-SP0",
  "python": "3.10.0",
  "pid": 13784,
  "ppid": 36440,
  "chain": [
    {
      "pid": 13784,
      "ppid": 36440,
      "name": "python.exe",
      "creation_ticks": 134330938701732093,
      "identity": "13784:134330938701732093",
      "identity_strength": "pid+creation-time"
    },
    {
      "pid": 36440,
      "ppid": 22608,
      "name": "pwsh.exe",
      "creation_ticks": 134330938697553892,
      "identity": "36440:134330938697553892",
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

## Run 2 stdout

```text
{
  "probe": "caller-current-process-anchor",
  "platform": "Windows-10-10.0.19045-SP0",
  "python": "3.10.0",
  "pid": 4256,
  "ppid": 4080,
  "chain": [
    {
      "pid": 4256,
      "ppid": 4080,
      "name": "python.exe",
      "creation_ticks": 134330938738234214,
      "identity": "4256:134330938738234214",
      "identity_strength": "pid+creation-time"
    },
    {
      "pid": 4080,
      "ppid": 22608,
      "name": "pwsh.exe",
      "creation_ticks": 134330938733892872,
      "identity": "4080:134330938733892872",
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

## Run 3 stdout

```text
{
  "probe": "caller-current-process-anchor",
  "platform": "Windows-10-10.0.19045-SP0",
  "python": "3.10.0",
  "pid": 36440,
  "ppid": 39108,
  "chain": [
    {
      "pid": 36440,
      "ppid": 39108,
      "name": "python.exe",
      "creation_ticks": 134330938776473975,
      "identity": "36440:134330938776473975",
      "identity_strength": "pid+creation-time"
    },
    {
      "pid": 39108,
      "ppid": 22608,
      "name": "pwsh.exe",
      "creation_ticks": 134330938769679844,
      "identity": "39108:134330938769679844",
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
