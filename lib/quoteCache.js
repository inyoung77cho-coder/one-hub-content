// [S20-1] 프로세스 내 시세·잔고 캐시 — 같은 틱/짧은 시간에 여러 컴포넌트가 같은 URL을
//   요청해도 네트워크는 1회만 나간다(동시 요청은 in-flight 공유, 이후는 TTL 캐시).
//   ⚠ KIS 잔고는 서버가 1분 주기로 갱신하므로 TTL 은 30초를 넘기지 말 것(화면이 잔고보다 낡음).
const DEFAULT_TTL = 30000; // 30s

const _cache = new Map();    // url -> { ts, data }
const _inflight = new Map(); // url -> Promise
let _gen = 0;                // [S21-6] 세대 카운터 — clear 이후 완료되는 옛 요청이 옛 값을 되심는 레이스 차단

// URL(GET·멱등) JSON을 캐시/중복제거하며 가져온다. 실패는 캐시하지 않는다(다음에 재시도).
export async function cachedJson(url, ttl = DEFAULT_TTL) {
  const hit = _cache.get(url);
  if (hit && Date.now() - hit.ts < ttl) return hit.data;
  const pending = _inflight.get(url);
  if (pending) return pending;
  const myGen = _gen; // [S21-6] 이 요청이 속한 세대. 완료 시점에 세대가 바뀌었으면 캐시에 넣지 않는다.
  const p = (async () => {
    try {
      const r = await fetch(url);
      const j = await r.json();
      // [S21-6] 응답 도착 전에 clearQuoteCache() 가 불렸다면(_gen 증가) 옛 값이므로 캐시에 저장하지 않음.
      if (j != null && myGen === _gen) _cache.set(url, { ts: Date.now(), data: j });
      return j;
    } catch {
      return null;
    } finally {
      _inflight.delete(url);
    }
  })();
  _inflight.set(url, p);
  return p;
}

// 보유 입력·매도 등으로 값이 바뀌면 호출측이 캐시를 비워 즉시 최신 반영.
export function clearQuoteCache() {
  _gen++; // [S21-6] 진행 중인 옛 요청의 결과가 캐시에 되심어지지 않도록 세대를 올린다.
  _cache.clear();
  _inflight.clear();
}

// 브라우저에서 자산 변경 이벤트가 오면 캐시를 비운다(입력 직후 낡은 값 방지).
if (typeof window !== "undefined") {
  try { window.addEventListener("onehub-assets-change", clearQuoteCache); } catch (e) {}
}
