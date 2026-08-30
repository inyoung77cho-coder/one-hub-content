// components/AlertSettingsCard.js — [P1-b] 관심단지 저평가 알림 설정·이력 (realestate.js에서 추출)
//   임계(저평가율) 충족 시 매 평일 아침 cron 이 웹푸시 발송. 발송 수신은 '설정'에서 웹푸시 알림을 켜야 함.
import { useEffect, useState } from "react";

export default function AlertSettingsCard() {
  const [enabled, setEnabled] = useState(true);
  const [threshold, setThreshold] = useState(5);
  const [history, setHistory] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [p, h] = await Promise.all([
          fetch("/api/pwa-alert-prefs").then((r) => r.json()).catch(() => ({})),
          fetch("/api/pwa-alert-history").then((r) => r.json()).catch(() => ({ items: [] })),
        ]);
        if (!alive) return;
        if (p && p.gap_threshold != null) { setEnabled(p.gap_enabled !== false); setThreshold(p.gap_threshold); }
        setHistory(Array.isArray(h.items) ? h.items : []);
      } catch (e) {} finally { if (alive) setLoaded(true); }
    })();
    return () => { alive = false; };
  }, []);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2200); };

  async function save(nextEnabled, nextThreshold) {
    setSaving(true);
    try {
      const r = await fetch("/api/pwa-alert-prefs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gap_enabled: nextEnabled, gap_threshold: nextThreshold }),
      });
      const d = await r.json();
      if (d.ok) flash("저장됐습니다"); else flash("저장 실패");
    } catch (e) { flash("네트워크 오류"); } finally { setSaving(false); }
  }

  const onToggle = () => { const n = !enabled; setEnabled(n); save(n, threshold); };
  const onThreshold = (v) => {
    const n = Math.max(1, Math.min(50, Number(v) || 5));
    setThreshold(n);
  };

  return (
    <section className="alert-card">
      <div className="ac-head">
        <div className="ac-title">🔔 관심단지 저평가 알림</div>
        <button className={`ac-sw ${enabled ? "on" : ""}`} onClick={onToggle} aria-pressed={enabled} disabled={saving}>
          <span className="ac-knob" />
        </button>
      </div>
      <p className="ac-desc">
        관심단지의 <b>저평가율</b>이 아래 기준을 넘으면 <b>웹푸시로 먼저 알려드립니다</b>.
        국토부 실거래 예측가 대비 현재 시세가 낮을 때 발화합니다. (미검증 참고 · 투자판단은 본인)
      </p>

      <div className="ac-thr" style={{ opacity: enabled ? 1 : 0.45 }}>
        <span className="ac-thr-l">저평가율 기준</span>
        <div className="ac-thr-c">
          <input type="range" min="1" max="30" step="1" value={threshold} disabled={!enabled}
            onChange={(e) => onThreshold(e.target.value)} onMouseUp={() => save(enabled, threshold)}
            onTouchEnd={() => save(enabled, threshold)} />
          <span className="ac-thr-v">{threshold}% 이상</span>
        </div>
      </div>

      <div className="ac-hist">
        <div className="ac-hist-h">최근 알림</div>
        {!loaded ? <div className="ac-empty">불러오는 중…</div>
          : history.length === 0 ? <div className="ac-empty">아직 발송된 알림이 없습니다. 기준을 넘는 관심단지가 생기면 여기에 쌓입니다.</div>
          : (
            <ul>
              {history.slice(0, 6).map((it, i) => (
                <li key={i}>
                  <span className="ac-h-danji">{it.danji}</span>
                  {it.gap != null && <span className="ac-h-gap">저평가 {Math.round(it.gap)}%</span>}
                  <span className="ac-h-date">{(it.created_at || "").slice(5, 16)}</span>
                </li>
              ))}
            </ul>
          )}
      </div>

      <p className="ac-foot">※ 알림을 받으려면 <b>설정 → 알림</b>에서 웹푸시 알림을 켜 주세요. 급매 알림(OneHub 호가 기반)은 준비 중입니다.</p>
      {toast && <div className="ac-toast">{toast}</div>}

      <style jsx>{`
        .alert-card { position: relative; background: var(--color-surface, #fff); border: 1px solid var(--color-line, #E1E9F5);
          border-radius: 16px; padding: 18px; margin: 14px 0; box-shadow: 0 6px 20px rgba(31,63,120,.06); }
        .ac-head { display: flex; align-items: center; justify-content: space-between; }
        .ac-title { font-size: 1.02rem; font-weight: 800; color: var(--color-ink, #12213B); letter-spacing: -.3px; }
        .ac-sw { width: 46px; height: 26px; border-radius: 999px; border: none; background: var(--color-line, #D7E0EF);
          position: relative; cursor: pointer; transition: background .15s; flex-shrink: 0; }
        .ac-sw.on { background: var(--color-accent, #2F6BFF); }
        .ac-knob { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff;
          transition: transform .15s; box-shadow: 0 1px 3px rgba(0,0,0,.25); }
        .ac-sw.on .ac-knob { transform: translateX(20px); }
        .ac-desc { font-size: 0.82rem; color: var(--color-ink-2, #46566E); line-height: 1.6; margin: 8px 0 14px; }
        .ac-thr { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
        .ac-thr-l { font-size: 0.82rem; font-weight: 700; color: var(--color-ink-2, #46566E); flex-shrink: 0; }
        .ac-thr-c { display: flex; align-items: center; gap: 10px; flex: 1; justify-content: flex-end; }
        .ac-thr-c input[type=range] { flex: 1; max-width: 160px; accent-color: var(--color-accent, #2F6BFF); }
        .ac-thr-v { font-size: 0.86rem; font-weight: 800; color: var(--color-accent, #2F6BFF); min-width: 62px; text-align: right; font-variant-numeric: tabular-nums; }
        .ac-hist { border-top: 1px solid var(--color-line, #EEF2F8); padding-top: 12px; }
        .ac-hist-h { font-size: 0.76rem; font-weight: 800; color: var(--color-ink-3, #8A99B0); margin-bottom: 8px; letter-spacing: .3px; }
        .ac-empty { font-size: 0.8rem; color: var(--color-ink-3, #8A99B0); line-height: 1.55; }
        .ac-hist ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
        .ac-hist li { display: flex; align-items: center; gap: 8px; font-size: 0.84rem; }
        .ac-h-danji { font-weight: 700; color: var(--color-ink, #12213B); }
        .ac-h-gap { font-size: 0.72rem; font-weight: 800; color: var(--color-undervalued, #0E9E6A); background: var(--color-undervalued-soft, #E7FAF2); padding: 2px 7px; border-radius: 6px; }
        .ac-h-date { margin-left: auto; font-size: 0.72rem; color: var(--color-ink-3, #A3AFC2); font-variant-numeric: tabular-nums; }
        .ac-foot { font-size: 0.72rem; color: var(--color-ink-3, #8A99B0); line-height: 1.55; margin: 12px 0 0; }
        .ac-toast { position: absolute; left: 50%; bottom: -10px; transform: translateX(-50%); background: var(--color-ink, #12213B);
          color: #fff; padding: 8px 16px; border-radius: 999px; font-size: 0.8rem; font-weight: 700; box-shadow: 0 8px 24px rgba(0,0,0,.25); }
      `}</style>
    </section>
  );
}
