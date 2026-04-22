// ── 푸시 발송 내역 ────────────────────────────
let allPushHistory = [];

async function loadPushHistory() {
  const tbody = document.getElementById("push-history-tbody");
  tbody.innerHTML = '<tr><td colspan="6" class="empty-msg">로딩 중...</td></tr>';
  try {
    let q = selectedAppId === "all"
      ? query(collection(db, "push_history"), orderBy("sentAt", "desc"), limit(100))
      : query(collection(db, "push_history"), where("appId","==", selectedAppId), orderBy("sentAt","desc"), limit(100));
    const snap = await getDocs(q);
    allPushHistory = [];
    snap.forEach(d => allPushHistory.push({ id: d.id, ...d.data() }));
    renderPushHistory(allPushHistory);
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-msg">오류: ${e.message}</td></tr>`;
  }
}

function renderPushHistory(list) {
  const tbody = document.getElementById("push-history-tbody");
  const countEl = document.getElementById("push-total-count");
  if (countEl) countEl.textContent = `전체 ${list.length}건`;

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-msg">발송 내역이 없습니다</td></tr>';
    return;
  }
  tbody.innerHTML = list.map((p, i) => `
    <tr>
      <td style="color:var(--text-muted); text-align:center;">${i + 1}</td>
      <td>
        <div style="font-weight:500; color:var(--text-heading); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:160px;">
          ${p.title || "(제목 없음)"}
        </div>
      </td>
      <td>
        <div style="color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:300px;">
          ${p.body || "—"}
        </div>
      </td>
      <td><span class="app-tag">${getAppName(p.appId)}</span></td>
      <td style="color:var(--text-muted); font-size:12px; white-space:nowrap;">${formatDateTime(p.sentAt)}</td>
      <td>
        <div style="display:flex; gap:4px;">
          <button class="btn-sm" onclick="editPush('${p.id}', '${(p.title||'').replace(/'/g,"\\'")}', '${(p.body||'').replace(/'/g,"\\'")}')">편집</button>
          <button class="btn-sm danger" onclick="deletePush('${p.id}')">삭제</button>
        </div>
      </td>
    </tr>
  `).join("");
}

// ── 푸시 검색 ────────────────────────────────
function filterPushHistory() {
  const keyword  = document.getElementById("push-search").value.trim().toLowerCase();
  const dateFrom = document.getElementById("push-date-from").value;
  const dateTo   = document.getElementById("push-date-to").value;

  let filtered = allPushHistory.filter(p => {
    // 키워드 검색
    const titleMatch = (p.title || "").toLowerCase().includes(keyword);
    const bodyMatch  = (p.body  || "").toLowerCase().includes(keyword);
    if (keyword && !titleMatch && !bodyMatch) return false;

    // 기간 검색
    if (dateFrom || dateTo) {
      const sentDate = p.sentAt?.toDate ? p.sentAt.toDate() : new Date(p.sentAt);
      if (dateFrom) {
        const from = new Date(dateFrom);
        from.setHours(0, 0, 0, 0);
        if (sentDate < from) return false;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        if (sentDate > to) return false;
      }
    }
    return true;
  });

  renderPushHistory(filtered);
}

document.getElementById("push-search-btn").addEventListener("click", filterPushHistory);
document.getElementById("push-search").addEventListener("keydown", e => {
  if (e.key === "Enter") filterPushHistory();
});
document.getElementById("push-reset-btn").addEventListener("click", () => {
  document.getElementById("push-search").value = "";
  document.getElementById("push-date-from").value = "";
  document.getElementById("push-date-to").value = "";
  renderPushHistory(allPushHistory);
});
