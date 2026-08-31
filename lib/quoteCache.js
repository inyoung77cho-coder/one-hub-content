// [S20-1] 프로세스 내 시세·잔고 캐시 — 같은 틱/짧은 시간에 여러 컴포넌트가 같은 URL을
//   요청해도 네트워크는 1회만 나간다(동시 요청은 in-flight 공유, 이후는 TTL 캐시).
//   ⚠ KIS 잔고는 서버가 1분 주기로 갱신하므로 TTL 은 30초를 넘기지 말 것(화면이 잔고보다 낡음).
const DEFAULT_TTL = 30000; // 30s

const _cache = new Map();    // url -> { ts, data }
const _inflight = new Map(); // url -> Promise

// URL(GET·멱등) JSON을 캐시/중복제거하며 가져온다. 실패는 캐시하지 않는다(다음에 재시도).
export async function cachedJson(url, ttl = DEFAULT_TTL) {
  const hit = _cache.get(url);
  if (hit && Date.now() - hit.ts < ttl) return hit.data;
  const pending = _inflight.get(url);
  if (pending) return pending;
  const p = (async () => {
    try {
      const r = await fetch(url);
      const j = await r.json();
      if (j != null) _cache.set(url, { ts: Date.now(), data: j });
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
  _cache.clear();
  _inflight.clear();
}

// 브라우저에서 자산 변경 이벤트가 오면 캐시를 비운다(입력 직후 낡은 값 방지).
if (typeof window !== "undefined") {
  try { window.addEventListener("onehub-assets-change", clearQuoteCache); } catch (e) {}
}
