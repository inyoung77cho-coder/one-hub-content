// pages/pwa/board-admin.js — 운영자 전용: 부동산 신규 정보(수집정보)·리포트·뉴스 게시물 수정/삭제.
//   미들웨어가 이 경로를 admin 전용으로 강제(ADMIN_ONLY_PAGES). 부동산은 /api/ops/board, 뉴스는 /api/ops/news.
//   [ⓐ] 4개 텔레그램 봇 중 콘텐츠를 발행하는 봇(ca-bot=부동산, 뉴스봇)을 이 한 화면에서 통합 관리.
//   삭제는 소프트 삭제(보드에서 내림/hidden 처리, 되돌릴 수 있음). 변경 시 공개 보드 즉시 재검증.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

const INFO_TYPES = ["매물", "시세소식", "개발호재", "기타"];
const NEWS_CATEGORIES = [
  ["markets", "주식"], ["realestate", "부동산"], ["etf", "ETF"], ["onehub_ai", "One-hub AI"],
  ["global", "글로벌"], ["macro", "거시"], ["policy", "정책"], ["affairs", "시사"],
];

export default function BoardAdmin() {
  const [tab, setTab] = useState("gathered"); // gathered | reports | news | users
  const [gathered, setGathered] = useState(null);
  const [reports, setReports] = useState(null);
  const [news, setNews] = useState(null);
  const [users, setUsers] = useState(null);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  // [보안 강화] 이 페이지는 middleware(ADMIN_ONLY_PAGES)가 1차로 막지만, 지인 계정이 탭 UI를
  //   본 사례가 보고돼 방어를 이중화한다 — 클라이언트도 /api/auth/me로 role을 직접 확인하기
  //   전까지는 탭·버튼 등 어떤 화면도 그리지 않는다(서버 응답을 신뢰, 클라 판단 없음).
  const [authChecked, setAuthChecked] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me").then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setIsAdminUser(!!d?.authenticated && d?.user?.role === "admin");
        setAuthChecked(true);
      })
      .catch(() => { if (alive) { setIsAdminUser(false); setAuthChecked(true); } });
    return () => { alive = false; };
  }, []);

  const load = useCallback(async (kind) => {
    try {
      const r = await fetch(`/api/ops/board?kind=${kind}`);
      if (r.status === 403) { setErr("운영자만 접근할 수 있습니다."); return; }
      const d = await r.json();
      if (!d.ok) { setErr(d.error || "불러오기 실패"); return; }
      setErr("");
      if (kind === "gathered") setGathered(d.items || []);
      else setReports(d.items || []);
    } catch (e) { setErr("네트워크 오류"); }
  }, []);

  // [ⓐ] 뉴스는 status(draft/published/hidden)가 있어 전부(운영자 관점) 불러온다 — 텔레그램으로
  //   막 올라와 아직 draft인 항목도 여기서 바로 보여야 "게시 즉시 확인"이 된다.
  const loadNews = useCallback(async () => {
    try {
      const r = await fetch("/api/ops/news");
      if (r.status === 403) { setErr("운영자만 접근할 수 있습니다."); return; }
      const d = await r.json();
      if (!d.ok) { setErr(d.error || "불러오기 실패"); return; }
      setErr("");
      setNews(d.items || []);
    } catch (e) { setErr("네트워크 오류"); }
  }, []);

  // [사용자 지시] 회원 목록·상태 관리 탭
  const loadUsers = useCallback(async () => {
    try {
      const r = await fetch("/api/ops/users");
      if (r.status === 403) { setErr("운영자만 접근할 수 있습니다."); return; }
      const d = await r.json();
      if (!d.ok) { setErr(d.error || "불러오기 실패"); return; }
      setErr("");
      setUsers(d.items || []);
    } catch (e) { setErr("네트워크 오류"); }
  }, []);

  async function updateUserStatus(userId, status, label) {
    const CONFIRM = { suspended: `"${label}" 계정을 정지할까요?`, withdrawn: `"${label}" 계정을 탈퇴 처리할까요? (되돌리려면 다시 활성화하면 됩니다)`, active: null };
    if (CONFIRM[status] && !window.confirm(CONFIRM[status])) return;
    const r = await fetch("/api/ops/users", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, status }),
    });
    const d = await r.json();
    if (d.ok) { flash("상태가 변경됐습니다"); loadUsers(); }
    else flash("변경 실패: " + (d.error || ""));
  }

  useEffect(() => {
    if (!isAdminUser) return;
    load("gathered"); load("reports"); loadNews(); loadUsers();
  }, [isAdminUser, load, loadNews, loadUsers]);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2200); };

  async function saveItem(kind, payload) {
    const r = await fetch("/api/ops/board", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, action: "update", ...payload }),
    });
    const d = await r.json();
    if (d.ok) { flash("저장됐습니다 · 보드에 반영 중"); load(kind); }
    else flash("저장 실패: " + (d.error || ""));
  }

  async function deleteItem(kind, id, label) {
    if (!window.confirm(`"${label}"\n보드에서 내립니다(되돌릴 수 있음). 계속할까요?`)) return;
    const r = await fetch("/api/ops/board", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, action: "delete", id }),
    });
    const d = await r.json();
    if (d.ok) { flash("보드에서 내렸습니다"); load(kind); }
    else flash("삭제 실패: " + (d.error || ""));
  }

  async function saveNews(id, patch) {
    const r = await fetch("/api/ops/news", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    const d = await r.json();
    if (d.ok) { flash("저장됐습니다 · '오늘' 페이지에 반영"); loadNews(); }
    else flash("저장 실패: " + (d.error || ""));
  }

  async function hideNews(id, label) {
    if (!window.confirm(`"${label}"\n'오늘' 화면에서 내립니다(되돌릴 수 있음). 계속할까요?`)) return;
    await saveNews(id, { status: "hidden" });
  }

  // [보안 강화] 서버(/api/auth/me) 확인이 끝나기 전엔 아무 것도 그리지 않는다 — 탭 구조·라벨조차
  //   비운영자에게 노출하지 않는다. 확인 결과 운영자가 아니면 탭/버튼 없이 안내만 표시.
  if (!authChecked) return null;
  if (!isAdminUser) {
    return (
      <div className="ba ba-denied">
        <p>운영자만 접근할 수 있는 페이지입니다.</p>
        <Link href="/pwa/settings" className="ba-back">← 설정으로</Link>
        <style jsx>{`
          .ba-denied { max-width: 480px; margin: 0 auto; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; font-family: var(--font-sans); color: var(--color-ink); padding: 0 20px; text-align: center; }
          .ba-denied .ba-back { color: var(--color-primary); font-weight: 700; text-decoration: none; }
        `}</style>
      </div>
    );
  }

  return (
    <div className="ba">
      <header className="ba-head">
        <div className="ba-headrow">
          <Link href="/pwa/settings" className="ba-back">← 설정</Link>
          <a href="/board-admin-guide.html" target="_blank" rel="noopener" className="ba-guide">📖 사용법 보기</a>
        </div>
        <h1>운영자 · 콘텐츠 관리</h1>
        <p className="ba-sub">텔레그램 봇으로 올린 부동산 정보·리포트·뉴스를 확인·수정하고, 회원 목록·상태도 관리합니다. 콘텐츠 변경은 공개 화면에 곧바로 반영됩니다.</p>
      </header>

      <div className="ba-tabs">
        <button className={tab === "gathered" ? "on" : ""} onClick={() => setTab("gathered")}>
          부동산 신규 정보 {gathered ? `(${gathered.length})` : ""}
        </button>
        <button className={tab === "reports" ? "on" : ""} onClick={() => setTab("reports")}>
          리포트 {reports ? `(${reports.length})` : ""}
        </button>
        <button className={tab === "news" ? "on" : ""} onClick={() => setTab("news")}>
          뉴스 {news ? `(최근 ${news.length})` : ""}
        </button>
        <button className={tab === "users" ? "on" : ""} onClick={() => setTab("users")}>
          회원 {users ? `(${users.length})` : ""}
        </button>
      </div>

      {err && <div className="ba-err">{err}</div>}

      {tab === "gathered" && (
        <div className="ba-list">
          {gathered === null ? <div className="ba-empty">불러오는 중…</div>
            : gathered.length === 0 ? <div className="ba-empty">게시된 수집 정보가 없습니다.</div>
            : gathered.map((it) => (
              <GatheredCard key={it.id} item={it}
                onSave={(p) => saveItem("gathered", { id: it.id, ...p })}
                onDelete={() => deleteItem("gathered", it.id, `${it.danji || "정보"} ${it.pyeong || ""}`.trim())} />
            ))}
        </div>
      )}

      {tab === "reports" && (
        <div className="ba-list">
          {reports === null ? <div className="ba-empty">불러오는 중…</div>
            : reports.length === 0 ? <div className="ba-empty">게시된 리포트가 없습니다.</div>
            : reports.map((it) => (
              <ReportCard key={it.id} item={it}
                onSave={(p) => saveItem("reports", { id: it.id, ...p })}
                onDelete={() => deleteItem("reports", it.id, it.title || "리포트")} />
            ))}
        </div>
      )}

      {tab === "news" && (
        <div className="ba-list">
          {news === null ? <div className="ba-empty">불러오는 중…</div>
            : news.length === 0 ? <div className="ba-empty">게시된 뉴스가 없습니다.</div>
            : news.map((it) => (
              <NewsCard key={it.id} item={it}
                onSave={(p) => saveNews(it.id, p)}
                onHide={() => hideNews(it.id, it.headline || "뉴스")} />
            ))}
        </div>
      )}

      {/* [사용자 지시] 회원 목록·상태 관리 — accounts.db(닉네임·카카오연동·티어·가입일) 실데이터 */}
      {tab === "users" && (
        <div className="ba-list">
          {users === null ? <div className="ba-empty">불러오는 중…</div>
            : users.length === 0 ? <div className="ba-empty">가입한 회원이 없습니다.</div>
            : users.map((u) => (
              <UserCard key={u.id} item={u} onChangeStatus={(status) => updateUserStatus(u.id, status, u.nickname || `#${u.id}`)} />
            ))}
        </div>
      )}

      {toast && <div className="ba-toast">{toast}</div>}

      <style jsx>{`
        .ba { max-width: 720px; margin: 0 auto; padding: 20px 16px 80px; font-family: 'Pretendard', sans-serif; color: #12213B; }
        .ba-headrow { display: flex; align-items: center; justify-content: space-between; }
        .ba-back { font-size: 13px; font-weight: 700; color: #2F6BFF; }
        .ba-guide { font-size: 12.5px; font-weight: 700; color: #64748B; text-decoration: none; background: #F1F5FB; padding: 6px 12px; border-radius: 999px; }
        .ba-head h1 { font-size: 1.35rem; font-weight: 800; margin: 10px 0 6px; letter-spacing: -.4px; }
        .ba-sub { font-size: 0.86rem; color: #64748B; margin: 0; line-height: 1.6; }
        .ba-tabs { display: flex; gap: 8px; margin: 20px 0 16px; }
        .ba-tabs button { flex: 1; padding: 11px; border: 1px solid #E1E9F5; background: #fff; border-radius: 12px;
          font-size: 0.9rem; font-weight: 800; color: #64748B; cursor: pointer; }
        .ba-tabs button.on { background: #2F6BFF; border-color: #2F6BFF; color: #fff; }
        .ba-err { background: #FEF2F2; border: 1px solid #FECACA; color: #B91C1C; padding: 12px 14px; border-radius: 10px; font-size: 0.86rem; margin-bottom: 14px; }
        .ba-list { display: grid; gap: 14px; }
        .ba-empty { text-align: center; color: #94A3B8; padding: 40px 0; font-size: 0.9rem; }
        .ba-toast { position: fixed; left: 50%; bottom: 84px; transform: translateX(-50%); background: #12213B; color: #fff;
          padding: 11px 20px; border-radius: 999px; font-size: 0.86rem; font-weight: 700; box-shadow: 0 8px 24px rgba(0,0,0,.25); z-index: 50; }
      `}</style>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="fld">
      <span>{label}</span>
      {children}
      <style jsx>{`
        .fld { display: flex; flex-direction: column; gap: 4px; }
        .fld > span { font-size: 0.72rem; font-weight: 800; color: #8A99B0; letter-spacing: .3px; }
      `}</style>
    </label>
  );
}

function GatheredCard({ item, onSave, onDelete }) {
  const [f, setF] = useState({
    danji: item.danji || "", pyeong: item.pyeong || "", price: item.price || "",
    info_type: item.info_type || "기타", summary: item.summary || "",
  });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const dirty = ["danji", "pyeong", "price", "info_type", "summary"].some((k) => (f[k] || "") !== (item[k] || ""));

  return (
    <div className="card">
      <div className="row3">
        <Field label="단지"><input value={f.danji} onChange={set("danji")} /></Field>
        <Field label="평형"><input value={f.pyeong} onChange={set("pyeong")} /></Field>
        <Field label="호가"><input value={f.price} onChange={set("price")} placeholder="예: 19.5억" /></Field>
      </div>
      <Field label="유형">
        <select value={f.info_type} onChange={set("info_type")}>
          {INFO_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="요약"><textarea rows={3} value={f.summary} onChange={set("summary")} /></Field>
      <div className="meta">게시 {item.posted_at || item.gathered_at} · id {item.id}</div>
      <div className="acts">
        <button className="del" onClick={onDelete}>보드에서 내리기</button>
        <button className="save" disabled={!dirty}
          onClick={() => onSave({ danji: f.danji, pyeong: f.pyeong, price: f.price, info_type: f.info_type, summary: f.summary })}>
          {dirty ? "저장" : "변경 없음"}
        </button>
      </div>
      <style jsx>{cardCss}</style>
    </div>
  );
}

function ReportCard({ item, onSave, onDelete }) {
  const [f, setF] = useState({
    title: item.title || "", headline: item.headline || "",
    period_label: item.period_label || "", overall: item.overall || "",
  });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const dirty = ["title", "headline", "period_label", "overall"].some((k) => (f[k] || "") !== (item[k] || ""));

  return (
    <div className="card">
      <Field label="제목"><input value={f.title} onChange={set("title")} /></Field>
      <Field label="헤드라인"><textarea rows={2} value={f.headline} onChange={set("headline")} /></Field>
      <Field label="기간 표기"><input value={f.period_label} onChange={set("period_label")} /></Field>
      <Field label="종합 요약(overall)"><textarea rows={4} value={f.overall} onChange={set("overall")} /></Field>
      <div className="meta">게시 {item.published_at || item.created_at} · {item.source_count}건 종합 · id {item.id}</div>
      <div className="acts">
        <button className="del" onClick={onDelete}>보드에서 내리기</button>
        <button className="save" disabled={!dirty}
          onClick={() => onSave({ title: f.title, headline: f.headline, period_label: f.period_label, overall: f.overall })}>
          {dirty ? "저장" : "변경 없음"}
        </button>
      </div>
      <style jsx>{cardCss}</style>
    </div>
  );
}

function NewsCard({ item, onSave, onHide }) {
  const [f, setF] = useState({
    category: item.category || "affairs", headline: item.headline || "",
    summary_md: item.summary_md || "", importance: item.importance ?? 3,
    pinned: !!item.pinned, status: item.status || "published",
  });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const setBool = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.checked }));
  const keys = ["category", "headline", "summary_md", "importance", "pinned", "status"];
  const dirty = keys.some((k) => String(f[k]) !== String(k === "pinned" ? !!item.pinned : (item[k] ?? (k === "importance" ? 3 : ""))));

  return (
    <div className="card">
      <div className="row3">
        <Field label="섹션">
          <select value={f.category} onChange={set("category")}>
            {NEWS_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="영향도(1~5)">
          <select value={f.importance} onChange={set("importance")}>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
        <Field label="게시 상태">
          <select value={f.status} onChange={set("status")}>
            <option value="draft">초안(비공개)</option>
            <option value="published">게시됨</option>
            <option value="hidden">내림</option>
          </select>
        </Field>
      </div>
      <Field label="헤드라인"><input value={f.headline} onChange={set("headline")} /></Field>
      <Field label="본문 — [기사요약]/[영향도] 형식 권장(불릿 -로 시작)">
        <textarea rows={5} value={f.summary_md} onChange={set("summary_md")}
          placeholder={"[기사요약]\n- \n[영향도]\n- 영향도: 85"} />
      </Field>
      <label className="pin"><input type="checkbox" checked={f.pinned} onChange={setBool("pinned")} /> 상단 고정</label>
      <div className="meta">{item.status === "draft" ? "🕓 초안" : item.status === "hidden" ? "🚫 내려짐" : "✅ 게시됨"} · {String(item.created_at || "").slice(0, 16).replace("T", " ")} · id {item.id}</div>
      <div className="acts">
        <button className="del" onClick={onHide}>화면에서 내리기</button>
        <button className="save" disabled={!dirty}
          onClick={() => onSave({ category: f.category, headline: f.headline, summary_md: f.summary_md, importance: Number(f.importance), pinned: f.pinned, status: f.status })}>
          {dirty ? "저장" : "변경 없음"}
        </button>
      </div>
      <style jsx>{cardCss}</style>
      <style jsx>{`.pin { display: flex; align-items: center; gap: 6px; font-size: 0.82rem; font-weight: 700; color: #475569; }`}</style>
    </div>
  );
}

const STATUS_KO = { active: "활성", suspended: "정지", withdrawn: "탈퇴" };

function UserCard({ item, onChangeStatus }) {
  const isSelf = item.role === "admin";
  return (
    <div className="card">
      <div className="urow">
        <div className="umeta">
          <div className="unick">{item.nickname || `#${item.id}`} {isSelf && <span className="uadmin">운영자</span>}</div>
          <div className="usub">{item.provider === "kakao" ? "카카오" : item.provider || "-"} · 가입 {String(item.created_at || "").slice(0, 10)} · 최근 로그인 {String(item.last_login_at || "-").slice(0, 10)}</div>
          <div className="usub">티어 {item.tier || "free"} ({item.sub_status || "-"})</div>
        </div>
        <span className={`ubadge s-${item.status}`}>{STATUS_KO[item.status] || item.status}</span>
      </div>
      {!isSelf && (
        <div className="acts">
          {item.status !== "active" && <button className="save" onClick={() => onChangeStatus("active")}>활성화</button>}
          {item.status !== "suspended" && <button className="del" onClick={() => onChangeStatus("suspended")}>정지</button>}
          {item.status !== "withdrawn" && <button className="del" onClick={() => onChangeStatus("withdrawn")}>탈퇴 처리</button>}
        </div>
      )}
      <style jsx>{cardCss}</style>
      <style jsx>{`
        .urow { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .umeta { display: flex; flex-direction: column; gap: 3px; }
        .unick { font-size: 0.98rem; font-weight: 800; color: #12213B; }
        .uadmin { font-size: 0.68rem; font-weight: 800; color: #B45309; background: #FEF3C7; padding: 2px 7px; border-radius: 999px; margin-left: 6px; }
        .usub { font-size: 0.76rem; color: #64748B; }
        .ubadge { flex-shrink: 0; font-size: 0.74rem; font-weight: 800; padding: 4px 10px; border-radius: 999px; }
        .ubadge.s-active { background: #DCFCE7; color: #15803D; }
        .ubadge.s-suspended { background: #FEF3C7; color: #B45309; }
        .ubadge.s-withdrawn { background: #FEE2E2; color: #B91C1C; }
      `}</style>
    </div>
  );
}

const cardCss = `
  .card { background: #fff; border: 1px solid #E1E9F5; border-radius: 16px; padding: 18px; display: grid; gap: 12px;
    box-shadow: 0 6px 20px rgba(31,63,120,.06); }
  .row3 { display: grid; grid-template-columns: 1.4fr .8fr 1fr; gap: 10px; }
  .card input, .card select, .card textarea { width: 100%; box-sizing: border-box; border: 1px solid #DDE6F3;
    border-radius: 9px; padding: 9px 11px; font-size: 0.9rem; font-family: inherit; color: #12213B; background: #fff; }
  .card textarea { resize: vertical; line-height: 1.55; }
  .card input:focus, .card select:focus, .card textarea:focus { outline: 2px solid #2F6BFF; outline-offset: 0; border-color: #2F6BFF; }
  .meta { font-size: 0.72rem; color: #A3AFC2; font-variant-numeric: tabular-nums; }
  .acts { display: flex; justify-content: space-between; gap: 10px; }
  .acts .del { background: #fff; border: 1px solid #FBC9C9; color: #DC2626; font-weight: 800; font-size: 0.84rem;
    padding: 9px 14px; border-radius: 10px; cursor: pointer; }
  .acts .save { background: #2F6BFF; border: none; color: #fff; font-weight: 800; font-size: 0.84rem;
    padding: 9px 20px; border-radius: 10px; cursor: pointer; }
  .acts .save:disabled { background: #C7D4EC; cursor: default; }
`;
