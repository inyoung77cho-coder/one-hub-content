import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect, useRef } from 'react';

const MENUS = [
  {
    label: 'Market',
    items: [
      { label: 'Market Center', href: '/market-center', badge: 'NEW' },
      { label: 'Decision Log',  href: '/decision-log' },
      { label: 'AI Accuracy',   href: '/ai-accuracy' },
    ],
  },
  {
    label: 'AI',
    items: [
      { label: 'AI Replay',   href: '/ai-replay',   badge: 'NEW' },
      { label: 'Engines',     href: '/engines' },
      { label: 'Trust',       href: '/trust' },
      { label: 'Leaderboard', href: '/leaderboard', badge: 'NEW' },
    ],
  },
  {
    label: 'Content',
    items: [
      { label: 'Blog',            href: '/blog' },
      { label: 'Weekly',          href: '/weekly' },
      { label: 'Daily',           href: '/daily' },
      { label: 'Learning Center', href: '/learning-center', badge: 'NEW' },
    ],
  },
  {
    label: 'Community',
    items: [
      { label: 'Community',  href: '/community' },
      { label: 'My Journey', href: '/my-journey',  badge: 'NEW' },
      { label: 'Feedback',   href: '/feedback',    badge: 'NEW' },
      { label: 'About',      href: '/about' },
    ],
  },
];

export default function Nav() {
  const router = useRouter();
  const [openMenu, setOpenMenu] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(null);
  const headerRef = useRef(null);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handler = (e) => {
      if (headerRef.current && !headerRef.current.contains(e.target)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // 페이지 이동 시 메뉴 닫기
  useEffect(() => {
    setMobileOpen(false);
    setOpenMenu(null);
  }, [router.pathname]);

  // 모바일 오픈 시 스크롤 잠금
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const isGroupActive = (menu) =>
    menu.items.some(i => router.pathname === i.href || router.pathname.startsWith(i.href + '/'));

  return (
    <>
      <style>{`
        .nav-desktop { display: flex; }
        .nav-app-btn { display: flex; }
        .nav-hamburger { display: none; }
        @media (max-width: 768px) {
          .nav-desktop { display: none !important; }
          .nav-app-btn { display: none !important; }
          .nav-hamburger { display: flex !important; }
        }
      `}</style>

      <header ref={headerRef} style={{
        borderBottom: '1px solid #DCE9F7',
        padding: '0 20px',
        height: 56,
        background: 'rgba(244,249,255,0.97)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        position: 'sticky',
        top: 0,
        zIndex: 1000,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', maxWidth: 1080, margin: '0 auto', height: '100%' }}>
          <Link href="/" style={{ fontFamily: "'Space Mono', monospace", fontSize: 14, fontWeight: 700, letterSpacing: '0.08em', color: '#16213D', textDecoration: 'none', flexShrink: 0, marginRight: 8 }}>
            [ONE-HUB]
          </Link>

          {/* PC 드롭다운 네비게이션 */}
          <nav className="nav-desktop" style={{ alignItems: 'center', gap: 2, flex: 1 }}>
            {MENUS.map((menu) => {
              const active = isGroupActive(menu);
              const open = openMenu === menu.label;
              return (
                <div key={menu.label} style={{ position: 'relative' }}>
                  <button
                    onMouseEnter={() => setOpenMenu(menu.label)}
                    onClick={() => setOpenMenu(open ? null : menu.label)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '8px 14px', borderRadius: 8, border: 'none',
                      cursor: 'pointer', height: 40,
                      background: active || open ? '#16213D' : 'transparent',
                      color: active || open ? '#F4F9FF' : '#5B7088',
                      fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 600,
                      whiteSpace: 'nowrap', transition: 'all 0.15s',
                    }}>
                    {menu.label}
                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ marginTop: 1, opacity: 0.6, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                      <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>

                  {/* 드롭다운 패널 — header 밖에서 portal 역할로 position:fixed 사용 */}
                  {open && (
                    <div
                      onMouseLeave={() => setOpenMenu(null)}
                      style={{
                        position: 'fixed',
                        top: 56,
                        zIndex: 9999,
                        background: '#fff',
                        borderRadius: 12,
                        minWidth: 188,
                        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
                        border: '1px solid #e2e8f0',
                        padding: '6px',
                      }}>
                      {menu.items.map((item) => {
                        const isCurrent = router.pathname === item.href || router.pathname.startsWith(item.href + '/');
                        return (
                          <Link key={item.href} href={item.href}
                            onClick={() => setOpenMenu(null)}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              padding: '10px 14px', borderRadius: 8, textDecoration: 'none',
                              color: isCurrent ? '#2563eb' : '#1e293b',
                              fontSize: 14, fontWeight: isCurrent ? 700 : 400,
                              background: isCurrent ? '#eff6ff' : 'transparent',
                            }}
                            onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.background = '#f0f6ff'; }}
                            onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.background = 'transparent'; }}>
                            {item.label}
                            {item.badge && (
                              <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: '#dbeafe', color: '#1d4ed8', marginLeft: 6, flexShrink: 0 }}>
                                {item.badge}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* PC App CTA */}
          <Link href="/pwa" className="nav-app-btn" style={{
            flexShrink: 0, alignItems: 'center', justifyContent: 'center',
            height: 36, padding: '0 16px', borderRadius: 8,
            background: '#2563eb', color: '#fff',
            textDecoration: 'none', fontFamily: "'Syne', sans-serif",
            fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
          }}>
            📱 App
          </Link>

          {/* 모바일 햄버거 */}
          <button
            className="nav-hamburger"
            onClick={() => setMobileOpen(m => !m)}
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              padding: 8, flexShrink: 0, color: '#16213D',
              display: 'flex', flexDirection: 'column', justifyContent: 'center',
              alignItems: 'center', gap: 5, width: 40, height: 40,
            }}>
            <span style={{ display: 'block', width: 22, height: 2, background: '#16213D', borderRadius: 2, transition: 'all 0.25s', transform: mobileOpen ? 'rotate(45deg) translate(5px, 5px)' : 'none' }} />
            <span style={{ display: 'block', width: 22, height: 2, background: '#16213D', borderRadius: 2, transition: 'all 0.25s', opacity: mobileOpen ? 0 : 1 }} />
            <span style={{ display: 'block', width: 22, height: 2, background: '#16213D', borderRadius: 2, transition: 'all 0.25s', transform: mobileOpen ? 'rotate(-45deg) translate(5px, -5px)' : 'none' }} />
          </button>
        </div>
      </header>

      {/* 모바일 풀스크린 메뉴 */}
      {mobileOpen && (
        <div style={{
          position: 'fixed', top: 56, left: 0, right: 0, bottom: 0,
          background: '#fff', zIndex: 999, overflowY: 'auto',
        }}>
          <div style={{ padding: '8px 0 40px' }}>
            {MENUS.map((menu) => {
              const isExp = mobileExpanded === menu.label;
              return (
                <div key={menu.label} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <button
                    onClick={() => setMobileExpanded(isExp ? null : menu.label)}
                    style={{
                      width: '100%', padding: '18px 24px', border: 'none',
                      background: 'transparent', cursor: 'pointer',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                    <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 17, fontWeight: 700, color: '#0f172a' }}>{menu.label}</span>
                    <svg width="14" height="8" viewBox="0 0 14 8" fill="none" style={{ flexShrink: 0, transform: isExp ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                      <path d="M1 1L7 7L13 1" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </button>

                  {isExp && (
                    <div style={{ background: '#f8fafc', paddingBottom: 6 }}>
                      {menu.items.map(item => {
                        const isCurrent = router.pathname === item.href;
                        return (
                          <Link key={item.href} href={item.href}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              padding: '16px 24px 16px 36px', textDecoration: 'none',
                              color: isCurrent ? '#2563eb' : '#374151',
                              fontSize: 16, fontWeight: isCurrent ? 700 : 400,
                              borderLeft: isCurrent ? '3px solid #2563eb' : '3px solid transparent',
                              background: isCurrent ? '#eff6ff' : 'transparent',
                            }}>
                            {item.label}
                            {item.badge && (
                              <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 5, background: '#dbeafe', color: '#1d4ed8' }}>
                                {item.badge}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            <div style={{ padding: '20px 20px 0' }}>
              <Link href="/pwa" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: 52, borderRadius: 12, background: '#2563eb', color: '#fff',
                textDecoration: 'none', fontWeight: 700, fontSize: 17,
              }}>
                📱 ONE-HUB 앱 열기
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
