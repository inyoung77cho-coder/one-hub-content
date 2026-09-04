// [이야기] 지역/날짜별 댓글 스레드. 백엔드 없이 GitHub Issues를 저장소로 사용(pages/api/comments.js).
//   pages/pwa/story.js("이야기" 탭)에서 사용 — date prop은 실제로는 지역명 등 스레드 키(문자열)이면 무엇이든 된다.
//   [OS-2] 글 작성 시 카테고리(전체/주식/ETF/부동산) 태깅 — 기본값 전체.
import { useState, useEffect } from "react";

const CATS = ["전체", "주식", "ETF", "부동산"];

export default function Comments({ date, title = "이야기", topic = "" }) {
  // [S29-11] title="우리 동네 이야기" 로 기대를 낮추고, topic(이번 회차 제목)이 있으면
  //   빈 화면에 대고 쓰는 대신 "이번 회차에 대해" 쓰도록 유도한다.
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [nick, setNick] = useState("");
  const [text, setText] = useState("");
  const [category, setCategory] = useState("전체");
  const [filter, setFilter] = useState("전체");
  const [error, setError] = useState("");
  // [S19-3 2026-08-30] 불러오기 실패를 '글 없음'으로 위장하지 않는다.
  //   실측: GET /api/comments?date=서현동 → {"error":"GitHub API 401"} 인데 화면은
  //   "아직 댓글이 없습니다"를 띄웠다. 게시판이 비어 있는 것과 고장 난 것은 다른 상태다.
  const [loadError, setLoadError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("onehub_nick");
    if (saved) { setNick(saved); setLoggedIn(true); }
    fetchComments();
  }, [date]);

  async function fetchComments() {
    setLoading(true);
    setLoadError("");
    try {
      const r = await fetch("/api/comments?date=" + encodeURIComponent(date));
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !Array.isArray(d.comments)) {
        // 인증 만료(401/403 → 503)인지 일시 장애인지 사용자 문장으로 구분해 준다.
        setLoadError(d.reason === "upstream_auth"
          ? "이야기 저장소 연결이 만료됐습니다 — 운영자 확인이 필요합니다."
          : "지금 이야기를 불러올 수 없습니다.");
        setComments([]);
        return;
      }
      setComments(d.comments);
    } catch (e) {
      setLoadError("네트워크 문제로 이야기를 불러오지 못했습니다.");
      setComments([]);
    }
    finally { setLoading(false); }
  }

  function handleLogin(e) {
    e.preventDefault();
    if (!nick.trim()) return;
    localStorage.setItem("onehub_nick", nick.trim());
    setLoggedIn(true);
  }

  function handleLogout() {
    localStorage.removeItem("onehub_nick");
    setLoggedIn(false);
    setNick("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setPosting(true); setError(""); setSuccess(false);
    try {
      const r = await fetch("/api/comments?date=" + date, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nick, text, category }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "error");
      setComments((prev) => [...prev, d]);
      setText("");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) { setError(e.message); }
    finally { setPosting(false); }
  }

  function formatTime(ts) {
    try {
      return new Date(ts).toLocaleString("ko-KR", {
        month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit",
      });
    } catch (e) { return ""; }
  }

  const visible = filter === "전체" ? comments : comments.filter((c) => (c.category || "전체") === filter);

  return (
    <div className="comments-section">
      <h3 className="comments-title">
        <span>{title}</span>
        <span className="comments-count">{comments.length}</span>
      </h3>

      <div className="comments-filters">
        {CATS.map((c) => (
          <button key={c} className={`cf-chip ${filter === c ? "on" : ""}`} onClick={() => setFilter(c)}>{c}</button>
        ))}
      </div>

      <div className="comments-list">
        {loading ? (
          <div className="comments-empty">불러오는 중...</div>
        ) : loadError ? (
          <div className="comments-error">
            <span>⚠ {loadError}</span>
            <button type="button" className="comments-retry" onClick={fetchComments}>다시 시도</button>
          </div>
        ) : visible.length === 0 ? (
          <div className="comments-empty">{filter !== "전체"
            ? `${filter} 카테고리 글이 아직 없습니다.`
            : topic
              ? `이번 회차 「${topic}」, 당신 생각은 어때요? 먼저 한마디 남겨보세요.`
              : "아직 이야기가 없습니다. 첫 이야기를 남겨보세요!"}</div>
        ) : (
          visible.map((c) => (
            <div key={c.id} className="comment-item">
              <div className="comment-header">
                <span className="comment-cat">{c.category || "전체"}</span>
                <span className="comment-nick">{c.nick}</span>
                <span className="comment-time">{formatTime(c.ts)}</span>
              </div>
              <div className="comment-text">{c.text}</div>
            </div>
          ))
        )}
      </div>

      {!loggedIn ? (
        <form className="login-form" onSubmit={handleLogin}>
          <p className="login-desc">닉네임을 입력하면 댓글을 남길 수 있어요.</p>
          <div className="login-row">
            <input className="login-input" placeholder="닉네임 (최대 20자)"
              value={nick} onChange={(e) => setNick(e.target.value)} maxLength={20} />
            <button className="login-btn" type="submit">확인</button>
          </div>
        </form>
      ) : (
        <form className="comment-form" onSubmit={handleSubmit}>
          <div className="comment-form-header">
            <span className="comment-form-nick">/ {nick}</span>
            <button type="button" className="logout-btn" onClick={handleLogout}>닉네임 변경</button>
          </div>
          <div className="comment-cats">
            {CATS.map((c) => (
              <button key={c} type="button" className={`cc-chip ${category === c ? "on" : ""}`} onClick={() => setCategory(c)}>{c}</button>
            ))}
          </div>
          <textarea className="comment-textarea"
            placeholder={topic ? `이번 회차 「${topic}」에 대해, 또는 우리 동네 이야기 (최대 500자)` : "오늘 시장, 종목, 뭐든 자유롭게 이야기해보세요 (최대 500자)"}
            value={text} onChange={(e) => setText(e.target.value)}
            maxLength={500} rows={3} />
          <div className="comment-form-footer">
            <span className="char-count">{text.length}/500</span>
            <button className="submit-btn" type="submit" disabled={posting || !text.trim()}>
              {posting ? "게시 중..." : "게시"}
            </button>
          </div>
          {error && <div className="comment-error">오류: {error}</div>}
          {success && <div className="comment-success">게시되었습니다!</div>}
        </form>
      )}

      <style jsx>{`
        .comments-section { font-family: var(--font-sans); }
        .comments-title { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 800; color: var(--color-ink); margin: 0 0 10px; }
        .comments-count { font-size: 11px; font-weight: 700; color: var(--color-ink-3); background: var(--color-card-soft); border-radius: 999px; padding: 2px 8px; }
        .comments-filters { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }
        .cf-chip { border: 1px solid var(--color-line); background: var(--color-card-soft); color: var(--color-ink-2); font-size: 11px; font-weight: 700; padding: 5px 11px; border-radius: 999px; cursor: pointer; font-family: var(--font-sans); }
        .cf-chip.on { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
        .comments-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; }
        .comments-empty { text-align: center; color: var(--color-ink-3); font-size: 13px; padding: 24px 0; }
        /* [S19-3] 고장은 고장이라고 말한다 — '글 없음'과 시각적으로 구분되게 */
        .comments-error { display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; color: var(--color-warning); font-size: 13px; line-height: 1.6; padding: 22px 12px; word-break: keep-all; }
        .comments-retry { border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); font-size: 12px; font-weight: 700; padding: 6px 14px; border-radius: 999px; cursor: pointer; font-family: var(--font-sans); }
        .comment-item { background: var(--color-card-soft); border-radius: 10px; padding: 10px 12px; }
        .comment-header { display: flex; align-items: baseline; gap: 6px; margin-bottom: 4px; }
        .comment-cat { font-size: 10px; font-weight: 800; color: var(--color-primary); background: var(--color-card); border-radius: 6px; padding: 1px 6px; flex-shrink: 0; }
        .comment-nick { font-size: 12.5px; font-weight: 700; color: var(--color-ink); }
        .comment-time { font-size: 10.5px; color: var(--color-ink-3); margin-left: auto; }
        .comment-text { font-size: 13px; color: var(--color-ink-2); line-height: 1.55; white-space: pre-wrap; word-break: break-word; }
        .login-form { display: flex; flex-direction: column; gap: 8px; }
        .login-desc { font-size: 12px; color: var(--color-ink-3); margin: 0; }
        .login-row { display: flex; gap: 8px; }
        .login-input { flex: 1; min-width: 0; border: 1px solid var(--color-line); border-radius: 10px; padding: 10px 12px; font-size: 13px; font-family: inherit; background: var(--color-card); color: var(--color-ink); }
        .login-btn { border: none; border-radius: 10px; padding: 10px 16px; font-size: 13px; font-weight: 700; background: var(--color-primary); color: #fff; cursor: pointer; }
        .comment-form { display: flex; flex-direction: column; gap: 8px; }
        .comment-form-header { display: flex; align-items: center; justify-content: space-between; }
        .comment-form-nick { font-size: 12px; font-weight: 700; color: var(--color-ink-2); }
        .logout-btn { border: none; background: none; color: var(--color-ink-3); font-size: 11.5px; cursor: pointer; text-decoration: underline; }
        .comment-cats { display: flex; gap: 6px; }
        .cc-chip { border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); font-size: 11px; font-weight: 700; padding: 5px 11px; border-radius: 999px; cursor: pointer; font-family: var(--font-sans); }
        .cc-chip.on { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
        .comment-textarea { border: 1px solid var(--color-line); border-radius: 10px; padding: 10px 12px; font-size: 13px; font-family: inherit; resize: vertical; background: var(--color-card); color: var(--color-ink); }
        .comment-form-footer { display: flex; align-items: center; justify-content: space-between; }
        .char-count { font-size: 10.5px; color: var(--color-ink-3); }
        .submit-btn { border: none; border-radius: 10px; padding: 8px 18px; font-size: 13px; font-weight: 700; background: var(--color-primary); color: #fff; cursor: pointer; }
        .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .comment-error { font-size: 12px; color: var(--color-danger); }
        .comment-success { font-size: 12px; color: var(--color-success); }
      `}</style>
    </div>
  );
}
