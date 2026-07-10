// [§3-8] 트레이더 계좌(A/B) 단일 소스 — localStorage + 브로드캐스트 이벤트
//   설정·홈 어디서 바꿔도 모든 페이지가 같은 계좌를 바라보도록 한다.
//   (기존엔 페이지마다 'A' 하드코딩/비영속 토글이라 전환이 반영되지 않았음)
import { useEffect, useState } from "react";

const KEY = "onehub_trader";
const EVT = "onehub-trader-change";

export function getTrader() {
  if (typeof window === "undefined") return "A";
  try { return localStorage.getItem(KEY) || "A"; } catch { return "A"; }
}

export function setTraderGlobal(t) {
  const v = t === "B" ? "B" : "A";
  try { localStorage.setItem(KEY, v); } catch {}
  try { window.dispatchEvent(new CustomEvent(EVT, { detail: v })); } catch {}
  return v;
}

// 현재 계좌를 구독하는 훅. 다른 페이지/컴포넌트에서 전환하면 즉시 반영된다.
export function useTrader() {
  const [trader, setTrader] = useState("A");
  useEffect(() => {
    setTrader(getTrader());
    const onChange = (e) => setTrader(e?.detail === "B" ? "B" : e?.detail === "A" ? "A" : getTrader());
    const onStorage = (e) => { if (e.key === KEY) setTrader(getTrader()); };
    window.addEventListener(EVT, onChange);
    window.addEventListener("storage", onStorage); // 다른 탭 동기화
    return () => { window.removeEventListener(EVT, onChange); window.removeEventListener("storage", onStorage); };
  }, []);
  const choose = (t) => setTrader(setTraderGlobal(t));
  return [trader, choose];
}
