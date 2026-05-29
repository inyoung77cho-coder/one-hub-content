
import { useState, useEffect } from 'react';



export default function Comments({ date }) {

  const [comments, setComments] = useState([]);

  const [loading,  setLoading]  = useState(true);

  const [posting,  setPosting]  = useState(false);

  const [nick,     setNick]     = useState('');

  const [text,     setText]     = useState('');

  const [error,    setError]    = useState('');

  const [success,  setSuccess]  = useState(false);

  const [loggedIn, setLoggedIn] = useState(false);



  useEffect(() => {

    const saved = localStorage.getItem('onehub_nick');

    if (saved) { setNick(saved); setLoggedIn(true); }

    fetchComments();

  }, [date]);



  async function fetchComments() {

    setLoading(true);

    try {

      const r = await fetch(`/api/comments?date=${date}`);

      const d = await r.json();

      setComments(d.comments || []);

    } catch { setComments([]); }

    finally { setLoading(false); }

  }



  function handleLogin(e) {

    e.preventDefault();

    if (!nick.trim()) return;

    localStorage.setItem('onehub_nick', nick.trim());

    setLoggedIn(true);

  }



  function handleLogout() {

    localStorage.removeItem('onehub_nick');

    setLoggedIn(false);

    setNick('');

  }



  async function handleSubmit(e) {

    e.preventDefault();

    if (!text.trim()) return;

    setPosting(true); setError(''); setSuccess(false);

    try {

      const r = await fetch(`/api/comments?date=${date}`, {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ nick, text }),

      });

      const d = await r.json();

      if (!r.ok) throw new Error(d.error || '오류 발생');

      setComments(prev => [...prev, d]);

      setText('');

      setSuccess(true);

      setTimeout(() => setSuccess(false), 3000);

    } catch (e) { setError(e.message); }

    finally { setPosting(false); }

  }



  function formatTime(ts) {

    try {

      return new Date(ts).toLocaleString('ko-KR', {

        month: '2-digit', day: '2-digit',

        hour: '2-digit', minute: '2-digit',

      });

    } catch { return ''; }

  }



  return (

    <div className="comments-section">

      <h3 className="comments-title">

        <span>������</span> 댓글

        <span className="comments-count">{comments.length}</span>

      </h3>



      <div className="comments-list">

        {loading ? (

          <div className="comments-empty">불러오는 중...</div>

        ) : comments.length === 0 ? (

          <div className="comments-empty">첫 번째 댓글을 남겨보세요.</div>

        ) : (

          comments.map(c => (

            <div key={c.id} className="comment-item">

              <div className="comment-header">

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

          <p className="login-desc">닉네임을 입력하면 댓글을 남길 수 있습니다.</p>

          <div className="login-row">

            <input className="login-input" placeholder="닉네임 (최대 20자)"

              value={nick} onChange={e => setNick(e.target.value)} maxLength={20} />

            <button className="login-btn" type="submit">확인</button>

          </div>

        </form>

      ) : (

        <form className="comment-form" onSubmit={handleSubmit}>

          <div className="comment-form-header">

            <span className="comment-form-nick">✏️ {nick}</span>

            <button type="button" className="logout-btn" onClick={handleLogout}>닉네임 변경</button>

          </div>

          <textarea className="comment-textarea"

            placeholder="오늘 시장에 대한 생각을 남겨주세요... (500자 이내)"

            value={text} onChange={e => setText(e.target.value)}

            maxLength={500} rows={3} />

          <div className="comment-form-footer">

            <span className="char-count">{text.length}/500</span>

            <button className="submit-btn" type="submit" disabled={posting || !text.trim()}>

              {posting ? '등록 중...' : '댓글 등록'}

            </button>

          </div>

          {error   && <div className="comment-error">⚠️ {error}</div>}

          {success && <div className="comment-success">✅ 댓글이 등록됐습니다.</div>}

        </form>

      )}

    </div>

  );

}

