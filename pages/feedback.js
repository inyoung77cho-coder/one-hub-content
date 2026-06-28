import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import CTABar from '../components/CTABar';

const CATEGORIES = ['버그 신고', '기능 제안', 'UI 개선', '기타'];

const ROADMAP = [
  { status: 'done',     items: ['PWA 설치', 'AI 판단 근거 (왜 추천?)', 'Decision Log', 'AI Accuracy Dashboard', 'Community 확장'] },
  { status: 'progress', items: ['AI Replay 전용 페이지', 'Market Center', 'Learning Center', 'My Journey'] },
  { status: 'planned',  items: ['AI Copilot (자연어 질의)', 'Leaderboard 멀티 전략', 'My Journey 공개·공유'] },
];

const APPLIED = [
  { quote: '"추천 이유를 알고 싶어요"',         done: '왜 추천? 버튼 + AI 설명 Bottom Sheet 추가' },
  { quote: '"차단 후 가격이 오른 경우 알고 싶다"', done: 'AI Accuracy Dashboard 추가 (차단 정확도 검증)' },
  { quote: '"모바일에서 업데이트가 안 돼요"',    done: 'Service Worker 캐시 전략 개선 (network-first)' },
];

const statusLabel = { done: '✅ 완료', progress: '🔄 진행 중', planned: '📋 예정' };
const statusColor = { done: '#f0fdf4', progress: '#eff6ff', planned: '#f8fafc' };
const statusText  = { done: '#16a34a', progress: '#2563eb', planned: '#64748b' };

export default function FeedbackCenter() {
  const [category, setCategory] = useState('기능 제안');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title || !content) return;
    setSubmitting(true);
    try {
      const res = await fetch('https://formspree.io/f/xdkoapqb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ category, title, content, contact }),
      });
      if (res.ok) { setSubmitted(true); setTitle(''); setContent(''); setContact(''); }
      else setSubmitting(false);
    } catch { setSubmitting(false); }
  };

  return (
    <>
      <Head>
        <title>Feedback Center — ONE-HUB</title>
        <meta name="description" content="ONE-HUB를 함께 만들어갑니다. 버그 신고, 기능 제안, UI 개선 의견을 보내주세요." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta property="og:title" content="Feedback Center — ONE-HUB" />
        <meta property="og:description" content="ONE-HUB를 함께 만들어갑니다. 버그 신고, 기능 제안, UI 개선 의견을 보내주세요." />
        <meta property="og:image" content="/icons/icon-512.png" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="ONE-HUB" />
        <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css" rel="stylesheet" />
      </Head>

      <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'Pretendard, sans-serif', paddingBottom: 80 }}>
        <main style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
          <Link href="/" style={{ color: '#64748b', fontSize: 13, textDecoration: 'none' }}>← ONE-HUB</Link>

          <div style={{ marginTop: 20, marginBottom: 28 }}>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>💬 Feedback Center</h1>
            <p style={{ fontSize: '0.9rem', color: '#64748b', margin: 0 }}>ONE-HUB를 함께 만들어갑니다</p>
          </div>

          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '24px', marginBottom: 20, boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>
            {submitted ? (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>감사합니다!</div>
                <div style={{ fontSize: 14, color: '#64748b' }}>검토 후 반영하겠습니다</div>
                <button onClick={() => setSubmitted(false)}
                  style={{ marginTop: 20, padding: '10px 24px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', color: '#2563eb', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                  다시 작성
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
                  {CATEGORIES.map(c => (
                    <button key={c} type="button" onClick={() => setCategory(c)}
                      style={{ padding: '7px 16px', borderRadius: 20, border: '1px solid #e2e8f0',
                        background: category === c ? '#2563eb' : '#fff',
                        color: category === c ? '#fff' : '#64748b',
                        cursor: 'pointer', fontSize: 13, fontWeight: category === c ? 700 : 400 }}>
                      {c}
                    </button>
                  ))}
                </div>

                {[
                  { label: '제목', value: title, onChange: setTitle, placeholder: '피드백 제목을 입력해주세요', required: true, type: 'input' },
                  { label: '내용', value: content, onChange: setContent, placeholder: '자세한 내용을 입력해주세요', required: true, type: 'textarea' },
                  { label: '연락처 (선택)', value: contact, onChange: setContact, placeholder: '이메일 또는 텔레그램 아이디', required: false, type: 'input' },
                ].map(({ label, value, onChange, placeholder, required, type }) => (
                  <div key={label} style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                      {label}{required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
                    </label>
                    {type === 'textarea' ? (
                      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} required={required}
                        rows={4} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0',
                          fontSize: 14, fontFamily: 'Pretendard, sans-serif', resize: 'vertical', outline: 'none',
                          color: '#1e293b', boxSizing: 'border-box' }} />
                    ) : (
                      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} required={required}
                        style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0',
                          fontSize: 14, fontFamily: 'Pretendard, sans-serif', outline: 'none',
                          color: '#1e293b', boxSizing: 'border-box' }} />
                    )}
                  </div>
                ))}

                <button type="submit" disabled={submitting || !title || !content}
                  style={{ width: '100%', height: 44, borderRadius: 10, border: 'none',
                    background: submitting || !title || !content ? '#94a3b8' : '#2563eb',
                    color: '#fff', fontSize: 15, fontWeight: 700, cursor: submitting ? 'wait' : 'pointer' }}>
                  {submitting ? '전송 중...' : '✉️ 피드백 보내기'}
                </button>
              </form>
            )}
          </div>

          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '20px', marginBottom: 20, boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 16 }}>🗺️ 개발 로드맵</div>
            {ROADMAP.map(({ status, items }) => (
              <div key={status} style={{ marginBottom: 14 }}>
                <div style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
                  background: statusColor[status], color: statusText[status], marginBottom: 8 }}>
                  {statusLabel[status]}
                </div>
                {items.map(item => (
                  <div key={item} style={{ fontSize: 13, color: '#475569', padding: '4px 0 4px 12px', borderLeft: `2px solid ${statusColor[status]}` }}>
                    {item}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '20px', marginBottom: 24, boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 14 }}>💡 최근 반영된 의견</div>
            {APPLIED.map((a, i) => (
              <div key={i} style={{ padding: '12px 0', borderBottom: i < APPLIED.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                <div style={{ fontSize: 13, color: '#64748b', fontStyle: 'italic', marginBottom: 5 }}>{a.quote}</div>
                <div style={{ fontSize: 13, color: '#22c55e', fontWeight: 600 }}>→ {a.done} ✅</div>
              </div>
            ))}
          </div>

          <CTABar />
        </main>
      </div>
    </>
  );
}
