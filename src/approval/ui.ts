export function renderApprovalCenter(): string {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SiYuan Approval Center</title>
  <style>
    :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; padding: 0; }
    .layout { display: grid; grid-template-columns: 320px 1fr; min-height: 100vh; }
    .sidebar { border-right: 1px solid #6664; padding: 16px; }
    .detail { padding: 16px; }
    .item { border: 1px solid #6664; border-radius: 8px; padding: 10px; margin-bottom: 10px; cursor: pointer; }
    .item.active { outline: 2px solid #4f8cff; }
    .muted { color: #888; }
    .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; border: 1px solid #6664; margin-left: 8px; font-size: 12px; }
    pre { white-space: pre-wrap; word-break: break-word; border: 1px solid #6664; border-radius: 8px; padding: 12px; }
    button { margin-right: 8px; padding: 8px 12px; }
  </style>
</head>
<body>
  <div class="layout">
    <aside class="sidebar">
      <h2>Approval Center</h2>
      <div id="count" class="muted">Loading...</div>
      <div id="list"></div>
    </aside>
    <main class="detail">
      <div id="detail">Select a pending approval.</div>
    </main>
  </div>
  <script>
    let selectedId = null;

    function fmtCountdown(expiresAt) {
      const ms = new Date(expiresAt).getTime() - Date.now();
      if (ms <= 0) return 'expired';
      const sec = Math.floor(ms / 1000);
      const mm = String(Math.floor(sec / 60)).padStart(2, '0');
      const ss = String(sec % 60).padStart(2, '0');
      return mm + ':' + ss;
    }

    async function fetchJson(url, init) {
      const res = await fetch(url, init);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    }

    async function refreshList() {
      const data = await fetchJson('/api/approval/requests');
      const pending = data.pending || [];
      const list = document.getElementById('list');
      const count = document.getElementById('count');
      count.textContent = pending.length + ' pending';
      if (!selectedId && pending[0]) selectedId = pending[0].id;
      if (selectedId && !pending.find((item) => item.id === selectedId)) {
        selectedId = pending[0] ? pending[0].id : null;
      }
      list.innerHTML = pending.map((item) => {
        const active = item.id === selectedId ? 'item active' : 'item';
        return '<div class="' + active + '" data-id="' + item.id + '">' +
          '<div><strong>' + escapeHtml(item.summary) + '</strong></div>' +
          '<div class="muted">' + escapeHtml(item.endpointId) + '</div>' +
          '<div>' + fmtCountdown(item.expiresAt) + '<span class="pill">' + escapeHtml(item.risk) + '</span></div>' +
          '</div>';
      }).join('');
      Array.from(document.querySelectorAll('[data-id]')).forEach((el) => {
        el.onclick = () => { selectedId = el.getAttribute('data-id'); refreshDetail(); refreshList(); };
      });
      refreshDetail();
    }

    function escapeHtml(value) {
      return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
    }

    async function act(action) {
      if (!selectedId) return;
      await fetchJson('/api/approval/requests/' + selectedId + '/' + action, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actor: 'human-browser' })
      });
      await refreshList();
    }

    async function refreshDetail() {
      const detail = document.getElementById('detail');
      if (!selectedId) {
        detail.innerHTML = '<div class="muted">No pending approvals.</div>';
        return;
      }
      const item = await fetchJson('/api/approval/requests/' + selectedId);
      detail.innerHTML =
        '<h2>' + escapeHtml(item.summary) + '</h2>' +
        '<p><strong>Risk:</strong> ' + escapeHtml(item.risk) + '</p>' +
        '<p><strong>Workspace:</strong> ' + escapeHtml(item.workspaceName) + '</p>' +
        '<p><strong>Endpoint:</strong> ' + escapeHtml(item.endpointId) + '</p>' +
        '<p><strong>Expires in:</strong> ' + fmtCountdown(item.expiresAt) + '</p>' +
        '<h3>Resources</h3>' +
        '<pre>' + escapeHtml((item.resourceSummary || []).join('\n')) + '</pre>' +
        '<h3>Preview</h3>' +
        '<pre>' + escapeHtml(JSON.stringify(item.payloadPreview, null, 2)) + '</pre>' +
        '<p><button id="approve">Approve</button><button id="reject">Reject</button></p>';
      document.getElementById('approve').onclick = () => act('approve');
      document.getElementById('reject').onclick = () => act('reject');
    }

    refreshList().catch((error) => {
      document.getElementById('detail').textContent = error.message;
    });
    setInterval(() => {
      refreshList().catch(() => {});
    }, 1000);
  </script>
</body>
</html>`;
}
