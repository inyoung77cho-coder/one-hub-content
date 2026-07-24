// pages/pwa/consent.js — 가입 필수 동의 화면(§8).
//   로그인했으나 필수 동의(이용약관·개인정보·투자유의)가 없는 계정을 여기로 유도.
//   제출 → /api/me/consent 저장 → consents_ok 되면 원래 목적지(next)로.
import { useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

const REQUIRED = [
  { type: "tos", label: "[필수] 이용약관 동의", href: "/terms" },
  { type: "privacy", label: "[필수] 개인정보 처리방침 동의", href: "/privacy" },
  { type: "invest_disclaimer", label: "[필수] 투자 유의사항·면책 고지 확인", href: "/disclaimer" },
];
const OPTIONAL = [
  { type: "marketing", label: "[선택] 마케팅 정보 수신(혜택·소식 알림)", href: null },
];

export default function ConsentPage() {
  const router = useRouter();
  const [checked, setChecked] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const next = typeof router.query.next === "string" && router.query.next.startsWith("/")
    ? router.query.next : "/pwa";
  const allRequired = REQUIRED.every((r) => checked[r.type]);
  const toggle = (t) => setChecked((c) => ({ ...c, [t]: !c[t] }));
  const toggleAll = () => {
    const on = !(allRequired && OPTIONAL.every((o) => checked[o.type]));
    const next = {};
    [...REQUIRED, ...OPTIONAL].forEach((x) => (next[x.type] = on));
    setChecked(next);
  };

  const submit = async () => {
    if (!allRequired || busy) return;
    setBusy(true); setErr("");
    try {
      const consents = [...REQUIRED, ...OPTIONAL].map((x) => ({ type: x.type, agreed: !!checked[x.type] }));
      const r = await fetch("/api/me/consent", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consents }),
      });
      const d = await r.json();
      if (r.status === 409) { setErr("세션이 만료됐습니다. 다시 로그인해 주세요."); return; }
      if (!r.ok || !d.consents_ok) { setErr(d.message || "저장에 실패했습니다. 잠시 후 다시 시도해 주세요."); return; }
      router.replace(next);
    } catch (e) {
      setErr("네트워크 오류입니다. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Head><title>서비스 이용 동의 | ONE-HUB</title></Head>
      <main className="cs-wrap">
        <h1 className="cs-h">서비스 이용에 동의해 주세요</h1>
        <p className="cs-sub">ONE-HUB를 이용하려면 아래 필수 항목에 동의가 필요합니다.</p>

        <button className="cs-all" onClick={toggleAll}>
          <span className={`cs-box ${allRequired && OPTIONAL.every((o) => checked[o.type]) ? "on" : ""}`}>✓</span>
          전체 동의 (선택 포함)
        </button>

        <div className="cs-list">
          {[...REQUIRED, ...OPTIONAL].map((x) => (
            <div className="cs-row" key={x.type}>
              <button className="cs-item" onClick={() => toggle(x.type)}>
                <span className={`cs-box ${checked[x.type] ? "on" : ""}`}>✓</span>
                <span className="cs-label">{x.label}</span>
              </button>
              {x.href && <a className="cs-view" href={x.href} target="_blank" rel="noreferrer">보기</a>}
            </div>
          ))}
        </div>

        {err && <p className="cs-err">{err}</p>}

        <button className="cs-submit" disabled={!allRequired || busy} onClick={submit}>
          {busy ? "저장 중…" : "동의하고 시작하기"}
        </button>
        <p className="cs-note">필수 동의 없이는 서비스를 이용할 수 없습니다. 마케팅 수신은 언제든 설정에서 해제할 수 있습니다.</p>
      </main>
      <style jsx>{`
        .cs-wrap { max-width: 440px; margin: 0 auto; padding: 40px 22px; font-family: 'Pretendard', sans-serif; color: #26364F; }
        .cs-h { font-size: 1.3rem; font-weight: 800; color: #12213B; margin: 0 0 6px; }
        .cs-sub { font-size: 0.9rem; color: #64748B; margin: 0 0 22px; line-height: 1.6; }
        .cs-all { display: flex; align-items: center; gap: 10px; width: 100%; padding: 14px; border: 1px solid #E1E9F5; border-radius: 12px; background: #F8FAFF; font-size: 0.95rem; font-weight: 800; color: #12213B; cursor: pointer; margin-bottom: 12px; font-family: inherit; }
        .cs-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 18px; }
        .cs-row { display: flex; align-items: center; justify-content: space-between; }
        .cs-item { display: flex; align-items: center; gap: 10px; flex: 1; padding: 11px 4px; background: none; border: none; text-align: left; cursor: pointer; font-family: inherit; }
        .cs-label { font-size: 0.88rem; color: #46566E; font-weight: 600; }
        .cs-box { flex-shrink: 0; width: 22px; height: 22px; border-radius: 6px; border: 1.5px solid #CBD5E1; color: transparent; display: inline-flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 900; }
        .cs-box.on { background: #2F6BFF; border-color: #2F6BFF; color: #fff; }
        .cs-view { font-size: 0.78rem; color: #2F6BFF; font-weight: 700; flex-shrink: 0; padding: 4px 6px; }
        .cs-err { font-size: 0.82rem; color: #E5484D; margin: 0 0 12px; }
        .cs-submit { width: 100%; padding: 15px; border: none; border-radius: 12px; background: #2F6BFF; color: #fff; font-size: 1rem; font-weight: 800; cursor: pointer; font-family: inherit; }
        .cs-submit:disabled { background: #CBD5E1; cursor: not-allowed; }
        .cs-note { font-size: 0.76rem; color: #94A3B8; line-height: 1.6; margin: 14px 0 0; }
      `}</style>
    </>
  );
}
