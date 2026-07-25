// pages/pwa/board-admin.js — 운영자 전용: 부동산 신규 정보(수집정보)·리포트 수정/삭제.
//   미들웨어가 이 경로를 admin 전용으로 강제(ADMIN_ONLY_PAGES). 데이터/변경은 /api/ops/board.
//   삭제는 소프트 삭제(보드에서 내림, 되돌릴 수 있음). 변경 시 공개 보드 즉시 재검증.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

const INFO_TYPES = ["매물", "시세소식", "개발호재", "기타"];

export default function BoardAdmin() {
  const [tab, setTab] = useState("gathered"); // gathered | reports
  const [gathered, setGathered] = useState(null);
  const [reports, setReports] = useState(null);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

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

  useEffect(() => { load("gathered"); load("reports"); }, [load]);

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

  return (
    <div className="ba">
      <header className="ba-head">
        <Link href="/pwa/settings" className="ba-back">← 설정</Link>
        <h1>운영자 · 보드 관리</h1>
        <p className="ba-sub">부동산 신규 정보와 리포트를 수정하거나 보드에서 내립니다. 변경은 공개 보드에 곧바로 반영됩니다.</p>
      </header>

      <div className="ba-tabs">
        <button className={tab === "gathered" ? "on" : ""} onClick={() => setTab("gathered")}>
          부동산 신규 정보 {gathered ? `(${gathered.length})` : ""}
        </button>
        <button className={tab === "reports" ? "on" : ""} onClick={() => setTab("reports")}>
          리포트 {reports ? `(${reports.length})` : ""}
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

      {toast && <div className="ba-toast">{toast}</div>}

      <style jsx>{`
        .ba { max-width: 720px; margin: 0 auto; padding: 20px 16px 80px; font-family: 'Pretendard', sans-serif; color: #12213B; }
        .ba-back { font-size: 13px; font-weight: 700; color: #2F6BFF; }
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
