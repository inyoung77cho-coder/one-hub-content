// [S47-3] 운영자 신고가·속보 입력 패널 — InputSheet 운영자 모드에서 '그대로 떼어 옮긴' 것.
//   ★재작성 아님: 상태(opCx·opPrice·opKind·opSrc)·addSpot·전송 형식
//     (POST /api/input/re-spot { complex_name, price_manwon, kind, source })이 원본과 같다 → 백엔드 배포 불필요.
//   ★이력: 2026-08-10 '화면 어디서도 연결이 안 돼 있던 걸 발견해' 설정 운영자 섹션에 연결했던 기능이다.
//     S47 부터는 /pwa/operator(설정 > 운영자 뷰 > 콘텐츠 운영)에서 연다. 다시 고아로 만들지 말 것.
//   ★append-only: 수정·삭제 UI 를 두지 않는다(오타는 새 기록으로 정정 — 현장 정보의 가치는 시계열).
//   ★쓰기는 서버가 admin 만 허용(S47-1, pages/api/input/[action].js). 화면 숨김에 의존하지 않는다.
import { useState } from "react";

const won = (n) => Number(n || 0).toLocaleString("ko-KR");
const eok = (m) => {
  const v = Number(m || 0) / 10000;
  return v >= 1 ? `${v.toFixed(2).replace(/\.00$/, "")}억` : `${won(m)}만`;
};
const j = async (url, opt) => {
  const r = await fetch(url, opt);
  return r.json();
};

// 책임 문구(결정 6) — 앱이 붙인다. 날짜·주체·미확정. 저장 형식은 바꾸지 않고 표시할 때 만든다.
export const SPOT_BY = "한곳지기 현장 메모";
export function spotStamp(dateStr) {
  return `${dateStr} 확인 · ${SPOT_BY} · 미확정`;
}
export function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function SpotOpPanel({ onSaved }) {
  // ── 운영자 속보 ── (InputSheet 원본 그대로)
  const [opCx, setOpCx] = useState("");
  const [opPrice, setOpPrice] = useState("");
  const [opKind, setOpKind] = useState("report");
  const [opSrc, setOpSrc] = useState("kakao");
  const [msg, setMsg] = useState("");
  const flash = (m) => setMsg(m);

  const addSpot = async () => {
    if (!opCx.trim() || !opPrice) return flash("단지·면적과 가격을 입력하세요");
    try {
      const d = await j(`/api/input/re-spot`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complex_name: opCx.trim(), price_manwon: Number(opPrice), kind: opKind, source: opSrc }),
      });
      if (d.ok) {
        flash(`속보 등록 · ${opCx} ${eok(opPrice)} — 미확정 레이어`);
        if (onSaved) onSaved(opCx.trim());
        setOpCx(""); setOpPrice("");
      }
      else flash(d.error === "operator only" ? "운영자 키 미설정/불일치" : d.error === "forbidden" ? "운영자만 입력할 수 있습니다" : `실패: ${d.error || ""}`);
    } catch (_) { flash("네트워크 오류"); }
  };

  return (
    <div className="oppanel">
      <div className="oph">🔒 신고가 · 속보 입력 <span>운영자 전용</span></div>
      <div className="opnote">정보원 반영이 늦는 신고가/매물을 수시 입력. 확정 실거래와 분리 저장 · 엔진(ONE Score·갭)에 미반영.</div>
      <div className="field"><label>단지 · 면적</label><input value={opCx} onChange={(e) => setOpCx(e.target.value)} placeholder="예: 시범삼성 84.7㎡" /></div>
      <div className="field"><label>가격 (만원)</label><input type="number" value={opPrice} onChange={(e) => setOpPrice(e.target.value)} placeholder="0" /></div>
      <div className="field"><label>유형</label>
        <div className="chips">
          {[["report", "신고가"], ["listing", "매물호가"], ["rumor", "소문"]].map(([k, l]) => (
            <div key={k} className={`chip ${opKind === k ? "sel" : ""}`} onClick={() => setOpKind(k)}>{l}</div>
          ))}
        </div>
      </div>
      <div className="field"><label>출처</label>
        <div className="chips">
          {[["kakao", "카카오톡"], ["sns", "SNS"], ["naver", "네이버"], ["manual", "수동"]].map(([k, l]) => (
            <div key={k} className={`chip ${opSrc === k ? "sel" : ""}`} onClick={() => setOpSrc(k)}>{l}</div>
          ))}
        </div>
      </div>
      <button className="btn amber" onClick={addSpot}>속보 등록</button>
      {/* [S47-3] 앱이 붙이는 책임 문구 미리보기(저장 전) */}
      <div className="stamp">{spotStamp(todayStr())}</div>
      {msg && <div className="msg" role="status">{msg}</div>}

      <style jsx>{`
        .oppanel { border: 1.5px dashed var(--color-warning, var(--amber)); background: var(--color-warning-soft, transparent); border-radius: 14px; padding: 14px; margin-top: 14px; color: var(--color-text); }
        .oph { display: flex; align-items: center; gap: 6px; font-weight: 800; color: var(--color-warning-ink, var(--color-warning)); font-size: 13.5px; }
        .oph span { font-weight: 600; font-size: 11px; opacity: .8; }
        .opnote { font-size: 12px; color: var(--color-warning-ink, var(--color-warning)); opacity: .85; margin: 2px 0 4px; }
        .field { margin-top: 12px; }
        .field label { display: block; font-size: 12.5px; color: var(--color-muted); margin-bottom: 5px; font-weight: 600; }
        input { width: 100%; padding: 12px 13px; border: 1.5px solid var(--color-line); border-radius: 11px; font-size: 15px; font-family: inherit; background: var(--color-bg); color: var(--color-text); outline: none; transition: .15s; box-sizing: border-box; }
        input:focus { border-color: var(--color-primary); box-shadow: 0 0 0 3px var(--color-primary-soft); }
        .chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
        .chip { padding: 7px 12px; border: 1.5px solid var(--color-line); border-radius: 99px; font-size: 13px; cursor: pointer; background: var(--color-bg); }
        .chip.sel { border-color: var(--color-warning, var(--amber)); color: var(--color-warning-ink, var(--color-warning)); font-weight: 700; }
        .btn { display: block; width: 100%; margin-top: 14px; padding: 13px; border: none; border-radius: 12px; background: var(--color-primary); color: #fff; font-weight: 700; font-size: 15px; font-family: inherit; cursor: pointer; transition: .15s; }
        .btn:active { transform: scale(.99); }
        .btn.amber { background: var(--color-warning, var(--amber)); }
        .stamp { margin-top: 8px; font-size: 12px; color: var(--color-muted); text-align: center; }
        .msg { margin-top: 8px; font-size: 13px; font-weight: 600; text-align: center; }
      `}</style>
    </div>
  );
}
