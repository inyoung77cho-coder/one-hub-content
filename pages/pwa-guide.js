import Head from 'next/head';
import Link from 'next/link';

export default function PwaGuide() {
  return (
    <>
      <Head>
        <title>PWA 설치 가이드 | ONE-HUB</title>
        <meta name="description" content="ONE-HUB PWA를 홈 화면에 추가하는 방법" />
      </Head>
      <div style={{ minHeight: '100vh', background: '#f0f6ff', fontFamily: 'Pretendard, sans-serif', paddingBottom: 60 }}>

        {/* 헤더 */}
        <div style={{ background: '#fff', borderBottom: '1px solid #e2eaf4', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 10 }}>
          <Link href="/" style={{ textDecoration: 'none', color: '#64748b', fontSize: 20 }}>←</Link>
          <span style={{ fontWeight: 700, fontSize: 17, color: '#1e293b' }}>📱 PWA 설치 가이드</span>
        </div>

        <div style={{ maxWidth: 520, margin: '0 auto', padding: '24px 16px' }}>

          {/* 소개 카드 */}
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>ONE-HUB를 앱처럼 사용하세요</div>
            <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.7 }}>
              PWA(Progressive Web App)로 설치하면 홈 화면에서 바로 실행하고,
              AI 추천 알림을 실시간으로 받을 수 있습니다.
            </div>
          </div>

          {/* iOS 가이드 */}
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 24 }}>🍎</span>
              <span style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>iPhone / iPad (iOS)</span>
            </div>
            {[
              { step: '1', icon: '🧭', title: 'Safari로 접속', desc: 'Chrome이 아닌 Safari 브라우저로 one-hub-content.vercel.app 접속' },
              { step: '2', icon: '📤', title: '공유 버튼 탭', desc: '하단 가운데 공유 버튼(□↑)을 탭합니다' },
              { step: '3', icon: '➕', title: '홈 화면에 추가', desc: '스크롤을 내려 "홈 화면에 추가" 선택 → 추가 탭' },
              { step: '4', icon: '🔔', title: '알림 허용', desc: 'PWA 실행 후 알림 허용 버튼을 탭하면 AI 추천 알림 수신 시작' },
            ].map((item) => (
              <div key={item.step} style={{ display: 'flex', gap: 14, marginBottom: 16 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#e0edff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#2563eb', flexShrink: 0 }}>
                  {item.step}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 2 }}>{item.icon} {item.title}</div>
                  <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Android 가이드 */}
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 24 }}>🤖</span>
              <span style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>Android</span>
            </div>
            {[
              { step: '1', icon: '🌐', title: 'Chrome으로 접속', desc: 'Chrome 브라우저로 one-hub-content.vercel.app 접속' },
              { step: '2', icon: '⋮', title: '메뉴 열기', desc: '우측 상단 점 3개(⋮) 버튼 탭' },
              { step: '3', icon: '📲', title: '앱 설치', desc: '"앱 설치" 또는 "홈 화면에 추가" 선택 → 설치 탭' },
              { step: '4', icon: '🔔', title: '알림 허용', desc: 'PWA 실행 후 알림 허용 → AI 추천 알림 수신 시작' },
            ].map((item) => (
              <div key={item.step} style={{ display: 'flex', gap: 14, marginBottom: 16 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#e0edff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#2563eb', flexShrink: 0 }}>
                  {item.step}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 2 }}>{item.icon} {item.title}</div>
                  <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* FAQ */}
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', marginBottom: 14 }}>자주 묻는 질문</div>
            {[
              { q: '알림이 오지 않아요', a: '설정 → 알림 → ONE-HUB에서 알림이 켜져 있는지 확인해주세요.' },
              { q: 'iOS에서 Chrome으로 설치되나요?', a: 'iOS는 반드시 Safari를 사용해야 합니다. Chrome은 iOS에서 PWA 설치를 지원하지 않습니다.' },
              { q: '앱 설치 메뉴가 안 보여요', a: '이미 설치되어 있거나, 잠시 후 다시 시도해주세요. 페이지를 30초 이상 열어두면 메뉴가 나타납니다.' },
            ].map((item, i) => (
              <div key={i} style={{ marginBottom: i < 2 ? 14 : 0, paddingBottom: i < 2 ? 14 : 0, borderBottom: i < 2 ? '1px solid #f1f5f9' : 'none' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Q. {item.q}</div>
                <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>A. {item.a}</div>
              </div>
            ))}
          </div>

          {/* PWA 바로가기 버튼 */}
          <Link href="/pwa" style={{ textDecoration: 'none' }}>
            <div style={{ background: '#2563eb', borderRadius: 14, padding: '16px 24px', textAlign: 'center', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
              🚀 ONE-HUB PWA 바로 열기
            </div>
          </Link>

        </div>
      </div>
    </>
  );
}