import Head from 'next/head';
import { useState } from 'react';
import PageHero from '../../components/PageHero';

const PTYPES = ['아파트', '오피스텔', '빌라/연립', '상가', '사무실', '토지', '기타'];
const DEALS = ['매매', '전세', '월세', '분양'];

const EMPTY = {
  company: '', manager: '', contact: '', ptype: '', deal: '',
  region: '', address: '', area: '', price: '', moveIn: '', realtime: false, memo: '',
};

export default function PartnerRealEstate() {
  const [form, setForm] = useState(EMPTY);
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [errMsg, setErrMsg] = useState('');

  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setStatus('loading'); setErrMsg('');
    try {
      const res = await fetch('/api/partners/realestate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (res.ok && d.ok) { setStatus('success'); setForm(EMPTY); }
      else { setStatus('error'); setErrMsg(d.error || '접수에 실패했습니다.'); }
    } catch {
      setStatus('error'); setErrMsg('네트워크 오류로 접수에 실패했습니다.');
    }
  };

  return (
    <>
      <Head>
        <title>협력업체 매물 등록 | ONE-HUB</title>
        <meta name="description" content="ONE-HUB 부동산 협력업체 전용 — 매물·실시간 시세 정보 접수 창구." />
        {/* 파트너 전용 유틸 페이지 — 검색 색인 제외 */}
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <div style={{ minHeight: '100vh', background: '#F4F9FF', fontFamily: 'Pretendard, sans-serif' }}>
        <PageHero
          eyebrow="Partners · 부동산"
          title="🏢 협력업체 매물 등록"
          subtitle="ONE-HUB와 협력하는 부동산 파트너 전용 접수 창구입니다. 매물·실시간 시세 정보를 남겨주시면 검토 후 연락드립니다."
        />
        <main className="oh-main" style={{ maxWidth: 720 }}>
          {status === 'success' ? (
            <div className="oh-card" style={{ textAlign: 'center', padding: '48px 32px' }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>✅</div>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: '#12213B', marginBottom: 10 }}>접수되었습니다</h2>
              <p style={{ fontSize: 14.5, color: '#64748B', lineHeight: 1.7, marginBottom: 24 }}>
                담당자가 확인 후 기재해주신 연락처로 회신드립니다. 감사합니다.
              </p>
              <button className="pf-btn pf-btn-ghost" onClick={() => setStatus('idle')}>매물 추가 등록 →</button>
            </div>
          ) : (
            <form className="oh-card" onSubmit={submit} style={{ padding: '30px 28px' }}>
              <p className="pf-note">
                * 표시는 필수 항목입니다. 본 창구는 <b>협력업체 담당자용</b>이며, 일반 이용자용이 아닙니다.
              </p>

              <div className="pf-grid">
                <Field label="협력업체명" req><input className="pf-in" value={form.company} onChange={set('company')} placeholder="예: 한빛공인중개사" /></Field>
                <Field label="담당자명"><input className="pf-in" value={form.manager} onChange={set('manager')} placeholder="예: 김철수" /></Field>
                <Field label="연락처(전화/이메일)" req><input className="pf-in" value={form.contact} onChange={set('contact')} placeholder="010-0000-0000 / name@email.com" /></Field>
                <Field label="매물 종류" req>
                  <select className="pf-in" value={form.ptype} onChange={set('ptype')}>
                    <option value="">선택</option>
                    {PTYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="거래 유형">
                  <select className="pf-in" value={form.deal} onChange={set('deal')}>
                    <option value="">선택</option>
                    {DEALS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="소재지(시/구/동)" req><input className="pf-in" value={form.region} onChange={set('region')} placeholder="예: 경기 성남시 분당구 서현동" /></Field>
                <Field label="상세 주소/단지명" full><input className="pf-in" value={form.address} onChange={set('address')} placeholder="예: 시범단지 삼성한신 101동" /></Field>
                <Field label="전용면적(㎡)"><input className="pf-in" value={form.area} onChange={set('area')} placeholder="예: 84.9" inputMode="decimal" /></Field>
                <Field label="가격(만원/억)"><input className="pf-in" value={form.price} onChange={set('price')} placeholder="예: 13억 5,000 / 보증금 1억·월 80" /></Field>
                <Field label="입주 가능일"><input className="pf-in" value={form.moveIn} onChange={set('moveIn')} placeholder="예: 즉시 / 2026-09" /></Field>
                <Field label="특이사항 / 매물 설명" full>
                  <textarea className="pf-in" rows={4} value={form.memo} onChange={set('memo')} placeholder="구조, 층, 향, 옵션, 실시간 시세 제공 가능 여부 등 자유 기재" />
                </Field>
              </div>

              <label className="pf-check">
                <input type="checkbox" checked={form.realtime} onChange={set('realtime')} />
                <span>실시간 시세·매물 상태 연동 정보 제공을 희망합니다.</span>
              </label>

              {status === 'error' && <p className="pf-err">⚠ {errMsg}</p>}

              <button type="submit" className="pf-btn pf-btn-primary" disabled={status === 'loading'}>
                {status === 'loading' ? '접수 중…' : '매물 정보 접수하기'}
              </button>
              <p className="pf-legal">
                제출하신 정보는 매물 검토·연락 목적에 한해 사용됩니다. 접수 저장·알림은 운영 백엔드 연동에 따라 처리됩니다.
              </p>
            </form>
          )}
        </main>
      </div>

      <style jsx>{`
        .pf-note { font-size: 13px; color: #64748B; line-height: 1.7; margin-bottom: 22px; }
        .pf-note b { color: #2F6BFF; }
        .pf-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 18px; }
        .pf-in {
          width: 100%; border: 1px solid #E8EEF7; border-radius: 12px; padding: 11px 13px;
          font-family: inherit; font-size: 14px; color: #1E293B; background: #F8FAFC; outline: none;
        }
        .pf-in:focus { border-color: #2F6BFF; background: #fff; box-shadow: 0 0 0 3px rgba(47,107,255,.12); }
        textarea.pf-in { resize: vertical; line-height: 1.6; }
        .pf-check { display: flex; align-items: center; gap: 10px; margin: 22px 0 6px; font-size: 14px; color: #334155; cursor: pointer; }
        .pf-check input { width: 17px; height: 17px; accent-color: #2F6BFF; }
        .pf-err { color: #F04452; font-size: 13.5px; margin: 14px 0 0; font-weight: 600; }
        .pf-btn { display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 15px; border: none; border-radius: 14px; cursor: pointer; font-family: inherit; }
        .pf-btn-primary { width: 100%; background: #2F6BFF; color: #fff; padding: 15px; margin-top: 20px; }
        .pf-btn-primary:disabled { opacity: .6; cursor: default; }
        .pf-btn-ghost { background: #fff; color: #2F6BFF; border: 1px solid #E8EEF7; padding: 12px 20px; }
        .pf-legal { font-size: 12px; color: #94A3B8; line-height: 1.6; margin-top: 14px; text-align: center; }
        @media (max-width: 560px) { .pf-grid { grid-template-columns: 1fr; } }
      `}</style>
    </>
  );
}

function Field({ label, req, full, children }) {
  return (
    <label style={{ display: 'block', gridColumn: full ? '1 / -1' : 'auto' }}>
      <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#475569', marginBottom: 7 }}>
        {label}{req && <span style={{ color: '#F04452', marginLeft: 3 }}>*</span>}
      </span>
      {children}
    </label>
  );
}
