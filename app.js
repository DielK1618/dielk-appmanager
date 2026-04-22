// =============================================
// DielK Vault Master Console — app.js
// 멀티앱 통합 관리 버전
// =============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, signOut,
  onAuthStateChanged, updateProfile, updatePassword
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, collection, getDocs, addDoc, deleteDoc, updateDoc,
  doc, query, orderBy, limit, serverTimestamp, getCountFromServer, where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB_8hn5GKx8EUnDf9r_BcnSv9YurmSNgdo",
  authDomain: "dielk-vault.firebaseapp.com",
  projectId: "dielk-vault",
  storageBucket: "dielk-vault.firebasestorage.app",
  messagingSenderId: "994228857474",
  appId: "1:994228857474:web:89e3fd7da7b5ec1119629b",
  measurementId: "G-NXBJ1WCJQC"
};
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db   = getFirestore(firebaseApp);

let registeredApps = [];
let selectedAppId  = "all";
let editingPushId  = null;

// ── 유틸 ─────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  t.classList.add("show");
  setTimeout(() => { t.classList.remove("show"); t.classList.add("hidden"); }, 3000);
}

function formatDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("ko-KR", { year:"numeric", month:"2-digit", day:"2-digit" });
}

function formatDateTime(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("ko-KR", { month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" });
}

function getInitials(name, email) {
  if (name && name.trim()) return name.trim().slice(0, 2).toUpperCase();
  return (email || "?").slice(0, 2).toUpperCase();
}

function getAppName(appId) {
  if (appId === "all") return "전체";
  const found = registeredApps.find(a => a.appId === appId);
  return found ? found.name : appId;
}

// ── 발송 폼 초기화 ───────────────────────────
function resetPushForm() {
  editingPushId = null;
  document.getElementById("push-title").value = "";
  document.getElementById("push-body").value  = "";
  const btn = document.getElementById("send-push-btn");
  btn.innerHTML = `<svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:white;margin-right:6px;vertical-align:middle"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>발송하기`;
  btn.style.background = "";
  document.getElementById("push-new-btn").classList.add("hidden");
  document.getElementById("push-edit-notice").classList.add("hidden");
}

// ── 페이지 전환 ──────────────────────────────
const PAGES_WITH_TABBAR = ["users", "messages", "push"];

function showPage(pageId) {
  // ✅ 현재 페이지 저장 (새로고침 시 복원)
  sessionStorage.setItem("currentPage", pageId);

  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  const target = document.getElementById("page-" + pageId);
  if (target) target.classList.add("active");
  document.querySelectorAll(".nav-item").forEach(n => {
    if (n.dataset.page === pageId) n.classList.add("active");
  });
  const tabbar = document.getElementById("app-tabbar");
  if (PAGES_WITH_TABBAR.includes(pageId)) {
    tabbar.classList.remove("hidden");
  } else {
    tabbar.classList.add("hidden");
  }
  if (pageId === "dashboard") loadDashboard();
  if (pageId === "apps")      loadApps();
  if (pageId === "users")     loadUsers();
  if (pageId === "messages")  loadMessages();
  if (pageId === "push")      loadPushHistory();
}

document.querySelectorAll(".nav-item").forEach(item => {
  item.addEventListener("click", () => showPage(item.dataset.page));
});
document.querySelectorAll(".card-link").forEach(link => {
  link.addEventListener("click", () => showPage(link.dataset.page));
});

// ── 앱 탭 렌더링 ─────────────────────────────
function renderAppTabs() {
  const container = document.getElementById("app-tabs");
  container.innerHTML = `<button class="app-tab ${selectedAppId === "all" ? "active" : ""}" data-appid="all">전체</button>`;
  registeredApps.forEach(a => {
    const btn = document.createElement("button");
    btn.className = "app-tab" + (selectedAppId === a.appId ? " active" : "");
    btn.dataset.appid = a.appId;
    btn.textContent = a.name;
    container.appendChild(btn);
  });
  container.querySelectorAll(".app-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedAppId = btn.dataset.appid;
      container.querySelectorAll(".app-tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const activePage = document.querySelector(".page.active")?.id?.replace("page-", "");
      if (activePage === "users")    loadUsers();
      if (activePage === "messages") loadMessages();
      if (activePage === "push")     loadPushHistory();
    });
  });
  updateAppSelects();
}

function updateAppSelects() {
  ["msg-appid", "push-appid"].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = '<option value="all">전체 앱</option>';
    registeredApps.forEach(a => {
      const opt = document.createElement("option");
      opt.value = a.appId;
      opt.textContent = a.name;
      sel.appendChild(opt);
    });
  });
}

// ── 인증 ─────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (user) {
    // ✅ 깜빡임 없이 앱 화면 표시
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("app").style.display = "flex";

    const name = user.displayName || user.email.split("@")[0];
    document.getElementById("admin-name-display").textContent = name;
    document.getElementById("admin-avatar").textContent = getInitials(user.displayName, user.email);
    document.getElementById("settings-email").value = user.email;
    document.getElementById("settings-name").value  = user.displayName || "";

    await loadAppsList();

    // ✅ 새로고침 시 마지막 페이지 복원
    const lastPage = sessionStorage.getItem("currentPage") || "dashboard";
    showPage(lastPage);

  } else {
    // ✅ 로그아웃 시 로그인 화면 표시
    document.getElementById("login-screen").style.display = "flex";
    document.getElementById("app").style.display = "none";
  }
});

document.getElementById("login-btn").addEventListener("click", async () => {
  const email = document.getElementById("login-email").value.trim();
  const pw    = document.getElementById("login-password").value;
  const errEl = document.getElementById("login-error");
  errEl.textContent = "";
  if (!email || !pw) { errEl.textContent = "이메일과 비밀번호를 입력하세요."; return; }
  const btn = document.getElementById("login-btn");
  btn.textContent = "로그인 중..."; btn.disabled = true;
  try {
    await signInWithEmailAndPassword(auth, email, pw);
  } catch (e) {
    errEl.textContent = "로그인 실패: 이메일 또는 비밀번호를 확인하세요.";
    btn.textContent = "로그인"; btn.disabled = false;
  }
});
document.getElementById("login-password").addEventListener("keydown", e => {
  if (e.key === "Enter") document.getElementById("login-btn").click();
});
document.getElementById("logout-btn").addEventListener("click", async () => {
  await signOut(auth);
  sessionStorage.removeItem("currentPage");
  showToast("로그아웃 되었습니다.");
});

// ── 앱 목록 ──────────────────────────────────
async function loadAppsList() {
  try {
    const snap = await getDocs(query(collection(db, "registered_apps"), orderBy("createdAt", "asc")));
    registeredApps = [];
    snap.forEach(d => registeredApps.push({ id: d.id, ...d.data() }));
    document.getElementById("apps-count").textContent = registeredApps.length;
    renderAppTabs();
  } catch (e) { console.error("앱 목록 로드 오류:", e); }
}

// ── 대시보드 ─────────────────────────────────
async function loadDashboard() {
  try {
    document.getElementById("stat-apps").textContent = registeredApps.length;
    const userSnap = await getCountFromServer(collection(db, "users"));
    document.getElementById("stat-users").textContent = userSnap.data().count;
    document.getElementById("users-count").textContent = userSnap.data().count;
    const msgSnap = await getCountFromServer(collection(db, "messages"));
    document.getElementById("stat-messages").textContent = msgSnap.data().count;
    document.getElementById("msg-count").textContent = msgSnap.data().count;
    const pushSnap = await getCountFromServer(collection(db, "push_history"));
    document.getElementById("stat-pushes").textContent = pushSnap.data().count;

    const recentUsersQ = query(collection(db, "users"), orderBy("createdAt", "desc"), limit(4));
    const recentUsers  = await getDocs(recentUsersQ);
    const ruList = document.getElementById("recent-users-list");
    if (recentUsers.empty) {
      ruList.innerHTML = '<div class="empty-msg">가입 회원이 없습니다</div>';
    } else {
      ruList.innerHTML = "";
      recentUsers.forEach(d => {
        const u = d.data();
        const div = document.createElement("div");
        div.className = "list-item";
        div.innerHTML = `
          <div class="avatar">${getInitials(u.displayName, u.email)}</div>
          <div class="item-info">
            <div class="item-name">${u.displayName || u.email || "알 수 없음"}</div>
            <div class="item-sub">${u.email || ""}</div>
          </div>
          <span class="app-tag">${getAppName(u.appId)}</span>
        `;
        ruList.appendChild(div);
      });
    }

    const appsList = document.getElementById("apps-summary-list");
    if (registeredApps.length === 0) {
      appsList.innerHTML = '<div class="empty-msg">등록된 앱이 없습니다</div>';
    } else {
      appsList.innerHTML = "";
      for (const a of registeredApps) {
        let count = 0;
        try {
          const cs = await getCountFromServer(query(collection(db, "users"), where("appId", "==", a.appId)));
          count = cs.data().count;
        } catch (_) {}
        const div = document.createElement("div");
        div.className = "list-item";
        div.innerHTML = `
          <div class="avatar" style="border-radius:8px">${a.name.slice(0,2).toUpperCase()}</div>
          <div class="item-info">
            <div class="item-name">${a.name}</div>
            <div class="item-sub">${a.appId}</div>
          </div>
          <span class="app-tag">${count}명</span>
        `;
        appsList.appendChild(div);
      }
    }
  } catch (e) { console.error("대시보드 오류:", e); }
}

// ── 앱 관리 ──────────────────────────────────
async function loadApps() {
  await loadAppsList();
  renderAppsGrid();
}

function renderAppsGrid() {
  const grid = document.getElementById("apps-grid");
  if (registeredApps.length === 0) {
    grid.innerHTML = '<div class="empty-msg">등록된 앱이 없습니다. + 앱 추가를 눌러 등록하세요.</div>';
    return;
  }
  grid.innerHTML = "";
  registeredApps.forEach(a => {
    const card = document.createElement("div");
    card.className = "app-card";
    card.innerHTML = `
      <div class="app-card-header">
        <div>
          <div class="app-card-name">${a.name}</div>
          <div class="app-card-id">${a.appId}</div>
        </div>
        <div class="app-card-icon">${a.name.slice(0,2).toUpperCase()}</div>
      </div>
      <div class="app-card-url">${a.url || "URL 없음"}</div>
      <div class="app-card-desc">${a.desc || ""}</div>
      <div class="app-card-footer">
        <button class="btn-sm" onclick="window.open('${a.url}','_blank')">사이트 열기</button>
        <button class="btn-sm danger" onclick="deleteApp('${a.id}', '${a.name}')">삭제</button>
      </div>
    `;
    grid.appendChild(card);
  });
}

const addAppForm = document.getElementById("add-app-form");
document.getElementById("add-app-btn").addEventListener("click", () => addAppForm.classList.remove("hidden"));
document.getElementById("add-app-close").addEventListener("click", () => addAppForm.classList.add("hidden"));
document.getElementById("add-app-cancel").addEventListener("click", () => addAppForm.classList.add("hidden"));

document.getElementById("save-app-btn").addEventListener("click", async () => {
  const name  = document.getElementById("new-app-name").value.trim();
  const appId = document.getElementById("new-app-id").value.trim().toLowerCase();
  const url   = document.getElementById("new-app-url").value.trim();
  const desc  = document.getElementById("new-app-desc").value.trim();
  if (!name || !appId) { showToast("앱 이름과 앱 ID는 필수입니다."); return; }
  if (!/^[a-z0-9-]+$/.test(appId)) { showToast("앱 ID는 영문 소문자, 숫자, 하이픈만 가능합니다."); return; }
  if (registeredApps.find(a => a.appId === appId)) { showToast("이미 사용 중인 앱 ID입니다."); return; }
  try {
    await addDoc(collection(db, "registered_apps"), { name, appId, url, desc, createdAt: serverTimestamp() });
    showToast(`"${name}" 앱이 등록되었습니다! ✓`);
    document.getElementById("new-app-name").value = "";
    document.getElementById("new-app-id").value   = "";
    document.getElementById("new-app-url").value  = "";
    document.getElementById("new-app-desc").value = "";
    addAppForm.classList.add("hidden");
    await loadAppsList(); renderAppsGrid(); loadDashboard();
  } catch (e) { showToast("등록 실패: " + e.message); }
});

window.deleteApp = async (docId, name) => {
  if (!confirm(`"${name}" 앱을 삭제하시겠습니까?`)) return;
  try {
    await deleteDoc(doc(db, "registered_apps", docId));
    showToast(`"${name}" 앱이 삭제되었습니다.`);
    await loadAppsList(); renderAppsGrid(); loadDashboard();
  } catch (e) { showToast("삭제 실패: " + e.message); }
};

// ── 회원 관리 ────────────────────────────────
let allUsers = [];

async function loadUsers() {
  const tbody = document.getElementById("users-table-body");
  tbody.innerHTML = '<tr><td colspan="6" class="empty-msg">로딩 중...</td></tr>';
  try {
    let q = selectedAppId === "all"
      ? query(collection(db, "users"), orderBy("createdAt", "desc"))
      : query(collection(db, "users"), where("appId", "==", selectedAppId), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    allUsers = [];
    snap.forEach(d => allUsers.push({ id: d.id, ...d.data() }));
    renderUsers(allUsers);
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-msg">오류: ${e.message}</td></tr>`;
  }
}

function renderUsers(list) {
  const tbody = document.getElementById("users-table-body");
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-msg">회원이 없습니다</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(u => `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="avatar" style="width:30px;height:30px;font-size:11px">${getInitials(u.displayName, u.email)}</div>
          <span>${u.displayName || "—"}</span>
        </div>
      </td>
      <td style="color:var(--text-muted)">${u.email || "—"}</td>
      <td><span class="app-tag">${getAppName(u.appId)}</span></td>
      <td style="color:var(--text-muted)">${formatDate(u.createdAt)}</td>
      <td><span class="pill ${u.isOnline ? "online" : "offline"}">${u.isOnline ? "접속중" : "오프라인"}</span></td>
      <td><button class="btn-sm danger" onclick="deleteUser('${u.id}')">삭제</button></td>
    </tr>
  `).join("");
}

document.getElementById("user-search").addEventListener("input", e => {
  const kw = e.target.value.toLowerCase();
  renderUsers(allUsers.filter(u =>
    (u.displayName || "").toLowerCase().includes(kw) ||
    (u.email || "").toLowerCase().includes(kw)
  ));
});

window.deleteUser = async (userId) => {
  if (!confirm("이 회원을 삭제하시겠습니까?")) return;
  try {
    await deleteDoc(doc(db, "users", userId));
    showToast("회원이 삭제되었습니다.");
    loadUsers(); loadDashboard();
  } catch (e) { showToast("삭제 실패: " + e.message); }
};

// ── 메시지 ───────────────────────────────────
async function loadMessages() {
  const tbody = document.getElementById("messages-table-body");
  tbody.innerHTML = '<tr><td colspan="5" class="empty-msg">로딩 중...</td></tr>';
  try {
    let q = selectedAppId === "all"
      ? query(collection(db, "messages"), orderBy("sentAt", "desc"))
      : query(collection(db, "messages"), where("appId", "==", selectedAppId), orderBy("sentAt", "desc"));
    const snap = await getDocs(q);
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-msg">메시지가 없습니다</td></tr>';
      return;
    }
    tbody.innerHTML = "";
    snap.forEach(d => {
      const m  = d.data();
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong style="color:var(--text-heading)">${m.title || "(제목 없음)"}</strong></td>
        <td><span class="app-tag">${getAppName(m.appId)}</span></td>
        <td style="color:var(--text-muted)">${m.to || "전체"}</td>
        <td style="color:var(--text-muted)">${formatDateTime(m.sentAt)}</td>
        <td><button class="btn-sm danger" onclick="deleteMessage('${d.id}')">삭제</button></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-msg">오류: ${e.message}</td></tr>`;
  }
}

const composeForm = document.getElementById("compose-form");
document.getElementById("compose-btn").addEventListener("click", () => composeForm.classList.remove("hidden"));
document.getElementById("compose-close").addEventListener("click", () => composeForm.classList.add("hidden"));
document.getElementById("compose-cancel").addEventListener("click", () => composeForm.classList.add("hidden"));

document.getElementById("send-message-btn").addEventListener("click", async () => {
  const appId = document.getElementById("msg-appid").value;
  const to    = document.getElementById("msg-to").value.trim();
  const title = document.getElementById("msg-title-input").value.trim();
  const body  = document.getElementById("msg-body").value.trim();
  if (!title || !body) { showToast("제목과 내용을 입력하세요."); return; }
  try {
    await addDoc(collection(db, "messages"), {
      appId: appId || "all", to: to || "all", title, body,
      sentAt: serverTimestamp(), sentBy: auth.currentUser?.email || "master"
    });
    showToast("메시지가 발송되었습니다! ✓");
    document.getElementById("msg-to").value = "";
    document.getElementById("msg-title-input").value = "";
    document.getElementById("msg-body").value = "";
    composeForm.classList.add("hidden");
    loadMessages(); loadDashboard();
  } catch (e) { showToast("발송 실패: " + e.message); }
});

window.deleteMessage = async (msgId) => {
  if (!confirm("이 메시지를 삭제하시겠습니까?")) return;
  try {
    await deleteDoc(doc(db, "messages", msgId));
    showToast("메시지가 삭제되었습니다.");
    loadMessages(); loadDashboard();
  } catch (e) { showToast("삭제 실패: " + e.message); }
};

// ── 푸시 알림 발송 ────────────────────────────
document.getElementById("send-push-btn").addEventListener("click", async () => {
  const appId = document.getElementById("push-appid").value;
  const title = document.getElementById("push-title").value.trim();
  const body  = document.getElementById("push-body").value.trim();
  if (!title || !body) { showToast("제목과 내용을 입력하세요."); return; }

  const btn = document.getElementById("send-push-btn");
  btn.textContent = "발송 중..."; btn.disabled = true;

  try {
    // ✅ 편집 모드 — 이전 알림 삭제 후 신규 발송
    if (editingPushId) {
      await deleteDoc(doc(db, "push_history", editingPushId));
      const logsSnap = await getDocs(
        query(collection(db, "notification_logs"), where("pushId", "==", editingPushId))
      );
      await Promise.all(logsSnap.docs.map(d => deleteDoc(d.ref)));
    }

    await addDoc(collection(db, "push_queue"), {
      appId: appId || "all", title, body,
      status: "pending", createdAt: serverTimestamp(),
      sentBy: auth.currentUser?.email || "master"
    });
    await addDoc(collection(db, "push_history"), {
      appId: appId || "all", title, body,
      target: getAppName(appId),
      sentAt: serverTimestamp(),
      sentBy: auth.currentUser?.email || "master"
    });

    showToast(editingPushId ? "수정 발송 완료! ✓" : "푸시 알림이 발송되었습니다! ✓");
    resetPushForm();
    loadPushHistory(); loadDashboard();

  } catch (e) {
    showToast("발송 실패: " + e.message);
  } finally {
    btn.innerHTML = `<svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:white;margin-right:6px;vertical-align:middle"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>발송하기`;
    btn.style.background = "";
    btn.disabled = false;
  }
});

// ✅ 신규 작성 / 편집 취소 버튼
document.getElementById("push-new-btn").addEventListener("click", () => {
  resetPushForm();
  showToast("새 알림 작성 모드입니다.");
});

// ── 푸시 발송 내역 ────────────────────────────
async function loadPushHistory() {
  const list = document.getElementById("push-history-list");
  list.innerHTML = '<div class="empty-msg">로딩 중...</div>';
  try {
    let q = selectedAppId === "all"
      ? query(collection(db, "push_history"), orderBy("sentAt", "desc"), limit(30))
      : query(collection(db, "push_history"), where("appId","==", selectedAppId), orderBy("sentAt","desc"), limit(30));
    const snap = await getDocs(q);
    if (snap.empty) { list.innerHTML = '<div class="empty-msg">발송 내역이 없습니다</div>'; return; }
    list.innerHTML = "";
    snap.forEach(d => {
      const p   = d.data();
      const div = document.createElement("div");
      div.className = "list-item";
      div.style.cssText = "flex-direction:column; align-items:stretch; gap:8px;";
      div.innerHTML = `
        <div style="display:flex; align-items:flex-start; gap:10px;">
          <div class="item-info">
            <div class="item-name">${p.title || "(제목 없음)"}</div>
            <div class="item-sub">${p.body || ""}</div>
            <div class="item-sub" style="margin-top:3px">
              <span class="app-tag" style="font-size:10px">${getAppName(p.appId)}</span>
              · ${formatDateTime(p.sentAt)}
            </div>
          </div>
          <div style="display:flex; gap:6px; flex-shrink:0; margin-top:2px;">
            <button class="btn-sm" onclick="editPush('${d.id}', '${(p.title||'').replace(/'/g,"\\'")}', '${(p.body||'').replace(/'/g,"\\'")}')">편집</button>
            <button class="btn-sm danger" onclick="deletePush('${d.id}')">삭제</button>
          </div>
        </div>
      `;
      list.appendChild(div);
    });
  } catch (e) {
    list.innerHTML = `<div class="empty-msg">오류: ${e.message}</div>`;
  }
}

// ✅ 편집 — 발송 폼에 내용 채우기 (발송 시에만 이전 알림 삭제)
window.editPush = (pushId, currentTitle, currentBody) => {
  editingPushId = pushId;
  document.getElementById("push-title").value = currentTitle;
  document.getElementById("push-body").value  = currentBody;

  const btn = document.getElementById("send-push-btn");
  btn.innerHTML = `<svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:white;margin-right:6px;vertical-align:middle"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>수정 발송하기`;
  btn.style.background = "#7c3aed";

  document.getElementById("push-new-btn").classList.remove("hidden");

  const notice = document.getElementById("push-edit-notice");
  notice.classList.remove("hidden");
  notice.textContent = "✏️ 편집 모드 — 수정 후 발송하면 이전 알림이 삭제되고 새 알림이 발송돼요. 취소하려면 위 버튼을 눌러주세요.";

  document.getElementById("push-title").scrollIntoView({ behavior: "smooth" });
  document.getElementById("push-title").focus();
};

// ✅ 삭제
window.deletePush = async (pushId) => {
  if (!confirm("이 알림을 삭제하시겠습니까?\n수신자의 알림 내역에서도 사라집니다.")) return;
  try {
    await deleteDoc(doc(db, "push_history", pushId));
    const logsSnap = await getDocs(
      query(collection(db, "notification_logs"), where("pushId", "==", pushId))
    );
    await Promise.all(logsSnap.docs.map(d => deleteDoc(d.ref)));
    showToast("알림이 삭제되었습니다. ✓");
    loadPushHistory(); loadDashboard();
  } catch (e) { showToast("삭제 실패: " + e.message); }
};

// ── 설정 ─────────────────────────────────────
document.getElementById("save-settings-btn").addEventListener("click", async () => {
  const name = document.getElementById("settings-name").value.trim();
  const pw   = document.getElementById("settings-pw").value;
  const msg  = document.getElementById("settings-msg");
  msg.classList.add("hidden");
  try {
    const user = auth.currentUser;
    if (name) {
      await updateProfile(user, { displayName: name });
      document.getElementById("admin-name-display").textContent = name;
      document.getElementById("admin-avatar").textContent = getInitials(name, user.email);
    }
    if (pw) {
      if (pw.length < 6) { showToast("비밀번호는 6자 이상이어야 합니다."); return; }
      await updatePassword(user, pw);
      document.getElementById("settings-pw").value = "";
    }
    msg.textContent = "저장되었습니다 ✓";
    msg.classList.remove("hidden");
    showToast("설정이 저장되었습니다! ✓");
  } catch (e) { showToast("저장 실패: " + e.message); }
});
