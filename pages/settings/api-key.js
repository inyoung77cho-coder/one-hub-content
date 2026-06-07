// -*- coding: utf-8 -*-
import Head from 'next/head';
import { useState } from 'react';

export default function ApiKeySettings() {
  const [form, setForm] = useState({
    trader_id: 'B',
    display_name: '',
    app_key: '',
    app_secret: '',
    account_no: '',
    account_code: '01',
    is_real: false,
    telegram_chat_id: '',
  });
  const [status, setStatus] = useState(null); // null | 'loading' | 'success' | 'error'
  const [message, setMessage] = useState('');
  const [masked, setMasked] = useState('');

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async () => {
    if (!form.display_name || !form.app_key || !form.app_secret || !form.account_no) {
      setStatus('error');
      setMessage('모든 필수 항목을 입력해 주세요.');
      return;
    }
    setStatus('loading');
    setMessage('');
    try {
      const ENGINE_API = process.env.NEXT_PUBLIC_ENGINE_API_URL || 'http://54.180.54.132:5001';
      const res = await fetch(`${ENGINE_API}/api/trader/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus('success');
        setMasked(data.app_key_masked);
        setMessage('API 키가 안전하게 저장되었습니다.');
        setForm(prev => ({ ...prev, app_key: '', app_secret: '', account_no: '' }));
      } else {
        setStatus('error');
        setMessage(data.error || '저장 중 오류가 발생했습니다.');
      }
    } catch (e) {
      setStatus('error');
      setMessage('서버 연결 오류. 잠시 후 다시 시도해 주세요.');
    }
  };

  const handleVerify = async () => {
    setStatus('loading');
    setMessage('API 키 검증 중...');
    try {
      const ENGINE_API = process.env.NEXT_PUBLIC_ENGINE_API_URL || 'http://54.180.54.132:5001';
      const res = await fetch(`${ENGINE_API}/api/trader/verify/${form.trader_id}`);
      const data = await res.json();
      if (data.ok) {
        setStatus('success');
        setMessage('✅ API 키 정상 확인! 자동매매 준비 완료입니다.');
      } else {
        setStatus('error');
        setMessage(`❌ 검증 실패: ${data.error}`);
      }
    } catch (e) {
      setStatus('error');
      setMessage('서버 연결 오류.');
    }
  };

  return (
    <>
      <Head>
        <title>API 키 설정 — ONE-HUB</title>
        <meta name="robots" content="noindex" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;700&display=swap" rel="stylesheet" />
      </Head>

      <div className="page-wrapper">
        <main className="main" style={{ maxWidth: '560px', margin: '0 auto', padding: '2rem 1rem' }}>

          <div style={{ marginBottom: '2rem' }}>
            <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              🔐 API 키 설정
            </h1>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', lineHeight: 1.7 }}>
              한국투자증권(KIS) API 키를 입력하면 AI가 자동으로 매매를 실행합니다.
              입력된 키는 AES-256 암호화되어 저장되며, 운영자도 원문을 볼 수 없습니다.
            </p>
          </div>

          {/* 안내 박스 */}
          <div style={{
            background: '#E6F1FB', border: '1px solid #85B7EB',
            borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem',
            fontSize: '0.8rem', color: '#0C447C', lineHeight: 1.7
          }}>
            <strong>KIS API 키 발급 방법</strong><br />
            한국투자증권 앱 → 마이페이지 → KIS Developers → API 신청<br />
            App Key + App Secret + 계좌번호를 준비해 주세요.
          </div>

          {/* 폼 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--color-muted)', display: 'block', marginBottom: '4px' }}>
                이름 (닉네임) *
              </label>
              <input
                name="display_name"
                value={form.display_name}
                onChange={handleChange}
                placeholder="예: 김철수"
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--color-muted)', display: 'block', marginBottom: '4px' }}>
                App Key *
              </label>
              <input
                name="app_key"
                value={form.app_key}
                onChange={handleChange}
                placeholder="KIS App Key"
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '0.9rem', fontFamily: 'Space Mono, monospace' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--color-muted)', display: 'block', marginBottom: '4px' }}>
                App Secret *
              </label>
              <input
                name="app_secret"
                type="password"
                value={form.app_secret}
                onChange={handleChange}
                placeholder="KIS App Secret"
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '0.9rem', fontFamily: 'Space Mono, monospace' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--color-muted)', display: 'block', marginBottom: '4px' }}>
                계좌번호 * (숫자만, 앞 8자리)
              </label>
              <input
                name="account_no"
                value={form.account_no}
                onChange={handleChange}
                placeholder="예: 12345678"
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '0.9rem', fontFamily: 'Space Mono, monospace' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                name="is_real"
                id="is_real"
                checked={form.is_real}
                onChange={handleChange}
              />
              <label htmlFor="is_real" style={{ fontSize: '0.875rem', color: 'var(--color-muted)' }}>
                실제 계좌로 매매 (체크 해제 시 모의투자)
              </label>
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--color-muted)', display: 'block', marginBottom: '4px' }}>
                텔레그램 Chat ID (선택)
              </label>
              <input
                name="telegram_chat_id"
                value={form.telegram_chat_id}
                onChange={handleChange}
                placeholder="텔레그램 알림 받을 Chat ID"
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}
              />
            </div>

          </div>

          {/* 상태 메시지 */}
          {message && (
            <div style={{
              marginTop: '1rem',
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '0.875rem',
              background: status === 'success' ? '#EAF3DE' : status === 'error' ? '#FCEBEB' : '#E6F1FB',
              color: status === 'success' ? '#27500A' : status === 'error' ? '#791F1F' : '#0C447C',
              border: `1px solid ${status === 'success' ? '#97C459' : status === 'error' ? '#F09595' : '#85B7EB'}`,
            }}>
              {message}
              {masked && <div style={{ marginTop: '4px', fontFamily: 'Space Mono, monospace', fontSize: '0.8rem' }}>App Key: {masked}</div>}
            </div>
          )}

          {/* 버튼 */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '1.5rem' }}>
            <button
              onClick={handleSubmit}
              disabled={status === 'loading'}
              style={{
                flex: 1, padding: '12px', borderRadius: '8px',
                background: '#1A1A1A', color: '#F8F7F2',
                border: 'none', fontSize: '0.9rem', fontWeight: 600,
                cursor: status === 'loading' ? 'not-allowed' : 'pointer',
                opacity: status === 'loading' ? 0.6 : 1,
              }}
            >
              {status === 'loading' ? '저장 중...' : '🔐 암호화 저장'}
            </button>
            <button
              onClick={handleVerify}
              disabled={status === 'loading'}
              style={{
                padding: '12px 20px', borderRadius: '8px',
                background: 'transparent', color: '#1A1A1A',
                border: '1px solid var(--color-border)',
                fontSize: '0.9rem', fontWeight: 600,
                cursor: status === 'loading' ? 'not-allowed' : 'pointer',
              }}
            >
              ✅ 검증
            </button>
          </div>

          <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--color-muted)', lineHeight: 1.7 }}>
            * 입력된 API 키는 AES-256 Fernet 암호화 후 서버 DB에 저장됩니다.
            운영자도 복호화된 원문을 확인할 수 없습니다.
          </p>

        </main>
      </div>
    </>
  );
}