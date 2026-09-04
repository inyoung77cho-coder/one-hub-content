// [S28-6] 엔진 개선 제안 승인 카드(정비소). ★승인해도 서버는 안 바뀐다 — 패치+배포명령만 만든다.
//   대기 제안이 없으면 '왜 없는지'를 정직하게 쓴다(표본·백테스트 기준). 예측 문장은 쓰지 않는다.
import { useEffect, useState } from "react";

export default function EngineProposals() {
  const [list, setList] = useState(null);
  const [result, setResult] = useState(null);

  const load = () =>
    fetch("/api/pwa/proposals")
      .then((r) => r.json())
      .then((d) => setList(d && d.ok ? d.proposals || [] : []))
      .catch(() => setList([]));
  useEffect(() => { load(); }, []);

  const decide = async (id, decision) => {
    try {
      const r = await fetch("/api/pwa/proposals", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decision }),
      }).then((x) => x.json());
      if (decision === "approve" && r && r.ok) setResult(r);
    } catch (e) {}
    load();
  };

  const pp = (v, unit = "%p") => (v == null ? "—" : `${v > 0 ? "+" : ""}${v}${unit}`);

  return (
    <section className="ep">
      <div className="ep-h">🔧 엔진 개선 제안 <span className="ep-sub">승인해도 서버는 바뀌지 않아요 · 패치·배포 명령만 만듭니다</span></div>
      {list === null ? (
        <div className="ep-empty">불러오는 중…</div>
      ) : list.length === 0 ? (
        <div className="ep-empty">대기 중 제안이 없습니다. 규칙당 표본 50건 이상이 쌓이고, 백테스트가 <b>뚜렷한 개선</b>을 보일 때만 제안이 올라옵니다 — 2~3건으로 규칙을 바꾸지 않습니다.</div>
      ) : (
        list.map((p) => {
          const bt = p.backtest || {};
          return (
            <div className="ep-card" key={p.id}>
              <div className="ep-t">제안 · {p.target} <span className="ep-move">{p.from_value} → {p.to_value}</span></div>
              <div className="ep-row"><b>근거</b> {p.reason} <span className="ep-n">표본 {p.sample_n}건</span></div>
              <div className="ep-row"><b>예상</b> 판단 {bt.n_change == null ? "—" : `${bt.n_change}건`} · 정확도 {pp(bt.acc_change)} · 누적수익 {bt.pnl_change == null ? "추정 불가(반사실)" : pp(bt.pnl_change)}</div>
              {Array.isArray(bt.limitations) && bt.limitations.length > 0 && (
                <ul className="ep-lim">{bt.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
              )}
              <div className="ep-acts">
                <button className="ep-b approve" onClick={() => decide(p.id, "approve")}>승인</button>
                <button className="ep-b" onClick={() => decide(p.id, "reject")}>거절</button>
                <button className="ep-b" onClick={() => decide(p.id, "later")}>나중에</button>
              </div>
            </div>
          );
        })
      )}

      {result && result.patch && (
        <div className="ep-patch">
          <div className="ep-patch-h">승인됨 · 서버는 아직 그대로입니다</div>
          <pre className="ep-patch-pre">{result.patch}</pre>
          <div className="ep-patch-cmd">적용: PowerShell 에서 <code>{result.deploy_cmd}</code> (게이트 7종 통과)</div>
        </div>
      )}
      <div className="ep-foot">백테스트가 좋다고 미래가 좋은 것은 아닙니다. 실제 적용은 사람이 배포 게이트를 통과시켜야 반영되고, 적용 뒤 성적이 나빠지면 되돌리기 제안이 먼저 뜹니다.</div>

      <style jsx>{`
        .ep { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card); box-shadow: var(--shadow-card); padding: 16px; margin-bottom: 12px; }
        .ep-h { font-weight: 800; font-size: var(--fs-4); color: var(--color-ink); margin-bottom: 12px; display: flex; align-items: baseline; gap: 7px; flex-wrap: wrap; }
        .ep-sub { font-size: var(--fs-1); font-weight: 700; color: var(--color-ink-3); }
        .ep-empty { font-size: var(--fs-3); color: var(--color-ink-2); line-height: 1.6; word-break: keep-all; }
        .ep-card { border: 1px solid var(--color-line); border-radius: var(--radius-md); padding: 13px; margin-bottom: 10px; background: var(--color-card-soft); }
        .ep-t { font-size: var(--fs-4); font-weight: 800; color: var(--color-ink); }
        .ep-move { color: var(--color-primary); }
        .ep-row { font-size: var(--fs-2); color: var(--color-ink-2); margin-top: 6px; line-height: 1.5; word-break: keep-all; }
        .ep-row b { color: var(--color-ink); font-weight: 800; margin-right: 5px; }
        .ep-n { color: var(--color-ink-3); margin-left: 4px; }
        .ep-lim { margin: 8px 0 0; padding-left: 18px; }
        .ep-lim li { font-size: var(--fs-1); color: var(--color-ink-3); line-height: 1.5; word-break: keep-all; }
        .ep-acts { display: flex; gap: 8px; margin-top: 11px; }
        .ep-b { flex: 1; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: var(--radius-sm); padding: 9px 0; font-size: var(--fs-3); font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        .ep-b.approve { border-color: var(--color-primary); background: var(--color-primary); color: var(--color-on-primary); }
        .ep-patch { margin-top: 10px; border: 1px solid var(--color-primary); border-radius: var(--radius-md); padding: 12px; background: var(--color-primary-soft); }
        .ep-patch-h { font-size: var(--fs-3); font-weight: 800; color: var(--color-primary); margin-bottom: 8px; }
        .ep-patch-pre { font-size: var(--fs-1); color: var(--color-ink); background: var(--color-card); border-radius: var(--radius-sm); padding: 10px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; margin: 0; }
        .ep-patch-cmd { font-size: var(--fs-2); color: var(--color-ink-2); margin-top: 8px; }
        .ep-patch-cmd code { background: var(--color-card); padding: 2px 6px; border-radius: var(--radius-sm); }
        .ep-foot { font-size: var(--fs-1); color: var(--color-ink-3); margin-top: 10px; line-height: 1.55; word-break: keep-all; }
      `}</style>
    </section>
  );
}
