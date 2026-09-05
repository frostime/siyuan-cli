# Process-anchor spike — OpenCode (Windows)

Platform: **OpenCode** on **Windows** (win32)

Method: three independent shell tool invocations from the same agent session, each running:

```
python .dev/changes/caller-current/prototype/process-anchor-spike.py
```

Three runs below, raw stdout only.

---

## Run 1

```json
{
  "probe": "caller-current-process-anchor",
  "platform": "Windows-10-10.0.19045-SP0",
  "python": "3.10.0",
  "pid": 31724,
  "ppid": 36104,
  "chain": [
    {
      "pid": 31724,
      "ppid": 36104,
      "name": "python.exe",
      "creation_ticks": 134330932507530740,
      "identity": "31724:134330932507530740",
      "identity_strength": "pid+creation-time"
    },
    {
      "pid": 36104,
      "ppid": 13868,
      "name": "pwsh.exe",
      "creation_ticks": 134330932502328373,
      "identity": "36104:134330932502328373",
      "identity_strength": "pid+creation-time"
    },
    {
      "pid": 13868,
      "ppid": 30708,
      "name": "opencode.exe",
      "creation_ticks": 134330931940869034,
      "identity": "13868:134330931940869034",
      "identity_strength": "pid+creation-time"
    },
    {
      "pid": 30708,
      "ppid": 39308,
      "name": "opencode.exe",
      "creation_ticks": 134330931940668977,
      "identity": "30708:134330931940668977",
      "identity_strength": "pid+creation-time"
    },
    {
      "pid": 39308,
      "ppid": 14308,
      "name": "pwsh.exe",
      "creation_ticks": 134330931875922719,
      "identity": "39308:134330931875922719",
      "identity_strength": "pid+creation-time"
    },
    {
      "pid": 14308,
      "ppid": 18560,
      "name": "Code.exe",
      "creation_ticks": 134329822247009697,
      "identity": "14308:134329822247009697",
      "identity_strength": "pid+creation-time"
    },
    {
      "pid": 18560,
      "ppid": 12520,
      "name": "Code.exe",
      "creation_ticks": 134329822162675089,
      "identity": "18560:134329822162675089",
      "identity_strength": "pid+creation-time"
    },
    {
      "pid": 12520,
      "ppid": 8260,
      "name": "DesktopMgr64.exe",
      "creation_ticks": 134329771457471297,
      "identity": "12520:134329771457471297",
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
  "pid": 19524,
  "ppid": 14652,
  "chain": [
    {
      "pid": 19524,
      "ppid": 14652,
      "name": "python.exe",
      "creation_ticks": 134330932556014391,
      "identity": "19524:134330932556014391",
      "identity_strength": "pid+creation-time"
    },
    {
      "pid": 14652,
      "ppid": 13868,
      "name": "pwsh.exe",
      "creation_ticks": 134330932550835234,
      "identity": "14652:134330932550835234",
      "identity_strength": "pid+creation-time"
    },
    {
      "pid": 13868,
      "ppid": 30708,
      "name": "opencode.exe",
      "creation_ticks": 134330931940869034,
      "identity": "13868:134330931940869034",
      "identity_strength": "pid+creation-time"
    },
    {
      "pid": 30708,
      "ppid": 39308,
      "name": "opencode.exe",
      "creation_ticks": 134330931940668977,
      "identity": "30708:134330931940668977",
      "identity_strength": "pid+creation-time"
    },
    {
      "pid": 39308,
      "ppid": 14308,
      "name": "pwsh.exe",
      "creation_ticks": 134330931875922719,
      "identity": "39308:134330931875922719",
      "identity_strength": "pid+creation-time"
    },
    {
      "pid": 14308,
      "ppid": 18560,
      "name": "Code.exe",
      "creation_ticks": 134329822247009697,
      "identity": "14308:134329822247009697",
      "identity_strength": "pid+creation-time"
    },
    {
      "pid": 18560,
      "ppid": 12520,
      "name": "Code.exe",
      "creation_ticks": 134329822162675089,
      "identity": "18560:134329822162675089",
      "identity_strength": "pid+creation-time"
    },
    {
      "pid": 12520,
      "ppid": 8260,
      "name": "DesktopMgr64.exe",
      "creation_ticks": 134329771457471297,
      "identity": "12520:134329771457471297",
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
  "pid": 33100,
  "ppid": 38964,
  "chain": [
    {
      "pid": 33100,
      "ppid": 38964,
      "name": "python.exe",
      "creation_ticks": 134330932601894781,
      "identity": "33100:134330932601894781",
      "identity_strength": "pid+creation-time"
    },
    {
      "pid": 38964,
      "ppid": 13868,
      "name": "pwsh.exe",
      "creation_ticks": 134330932597259007,
      "identity": "38964:134330932597259007",
      "identity_strength": "pid+creation-time"
    },
    {
      "pid": 13868,
      "ppid": 30708,
      "name": "opencode.exe",
      "creation_ticks": 134330931940869034,
      "identity": "13868:134330931940869034",
      "identity_strength": "pid+creation-time"
    },
    {
      "pid": 30708,
      "ppid": 39308,
      "name": "opencode.exe",
      "creation_ticks": 134330931940668977,
      "identity": "30708:134330931940668977",
      "identity_strength": "pid+creation-time"
    },
    {
      "pid": 39308,
      "ppid": 14308,
      "name": "pwsh.exe",
      "creation_ticks": 134330931875922719,
      "identity": "39308:134330931875922719",
      "identity_strength": "pid+creation-time"
    },
    {
      "pid": 14308,
      "ppid": 18560,
      "name": "Code.exe",
      "creation_ticks": 134329822247009697,
      "identity": "14308:134329822247009697",
      "identity_strength": "pid+creation-time"
    },
    {
      "pid": 18560,
      "ppid": 12520,
      "name": "Code.exe",
      "creation_ticks": 134329822162675089,
      "identity": "18560:134329822162675089",
      "identity_strength": "pid+creation-time"
    },
    {
      "pid": 12520,
      "ppid": 8260,
      "name": "DesktopMgr64.exe",
      "creation_ticks": 134329771457471297,
      "identity": "12520:134329771457471297",
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
