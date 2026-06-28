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
      { label: 'Community',   href: '/community' },
      { label: 'My Journey',  href: '/my-journey',  badge: 'NEW' },
      { label: 'Feedback',    href: '/feedback',    badge: 'NEW' },
      { label: 'About',       href: '/about' },
    ],
  },
];

export default function Nav() {
  const router = useRouter();
  const [openMenu, setOpenMenu] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(null);
  const navRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) setOpenMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setOpenMenu(null);
  }, [router.pathname]);

  const isGroupActive = (menu) => menu.items.some(i => router.pathname === i.href || router.pathname.startsWith(i.href + '/'));

  return (
    <header ref={navRef} style={{
      borderBottom: '1px solid #DCE9F7',
      padding: '0 1.5rem',
      height: 56,
      background: 'rgba(244,249,255,0.97)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      position: 'sticky',
      top: 0,
      zIndex: 1000,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', maxWidth: 1080, margin: '0 auto', height: '100%' }}>
        <Link href="/" style={{ fontFamily: "'Space Mono', monospace", fontSize: 14, fontWeight: 700, letterSpacing: '0.08em', color: '#16213D', textDecoration: 'none', flexShrink: 0, marginRight: 12 }}>
          [ONE-HUB]
        </Link>

        <nav style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, overflow: 'hidden' }}>
          {MENUS.map((menu) => {
            const active = isGroupActive(menu);
            const open = openMenu === menu.label;
            return (
              <div key={menu.label} style={{ position: 'relative' }}>
                <button
                  onClick={() => setOpenMenu(open ? null : menu.label)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 3, padding: '6px 12px',
                    borderRadius: 999, border: 'none', cursor: 'pointer',
                    background: active || open ? '#16213D' : 'transparent',
                    color: active || open ? '#F4F9FF' : '#5B7088',
                    fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 600,
                    whiteSpace: 'nowrap', transition: 'all 0.15s',
                  }}>
                  {menu.label}
                  <span style={{ fontSize: 9, opacity: 0.7, marginTop: 1 }}>{open ? '▲' : '▼'}</span>
                </button>

                {open && (
                  <div style={{
                    position: 'absolute', top: 44, left: 0, zIndex: 9999,
                    background: '#fff', borderRadius: 12, minWidth: 168,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                    border: '1px solid #e2e8f0', padding: '6px 0',
                  }}>
                    {menu.items.map((item) => {
                      const isCurrent = router.pathname === item.href || router.pathname.startsWith(item.href + '/');
                      return (
                        <Link key={item.href} href={item.href}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '9px 16px', textDecoration: 'none',
                            color: isCurrent ? '#2563eb' : '#1e293b',
                            fontSize: 13, fontWeight: isCurrent ? 700 : 400,
                            background: isCurrent ? '#eff6ff' : 'transparent',
                            transition: 'background 0.1s',
                          }}
                          onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.background = '#f0f6ff'; }}
                          onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.background = 'transparent'; }}>
                          {item.label}
                          {item.badge && (
                            <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 4, background: '#dbeafe', color: '#1d4ed8', marginLeft: 6 }}>
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

        <Link href="/pwa" style={{
          flexShrink: 0, padding: '7px 14px', borderRadius: 8, background: '#2563eb', color: '#fff',
          textDecoration: 'none', fontFamily: "'Syne', sans-serif", fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
        }}>
          App ▶
        </Link>

        <button
          onClick={() => setMobileOpen(m => !m)}
          style={{ display: 'none', border: 'none', background: 'transparent', cursor: 'pointer', padding: 6, flexShrink: 0, fontSize: 18, color: '#5B7088' }}
          className="nav-hamburger">
          {mobileOpen ? '✕' : '☰'}
        </button>
      </div>

      {mobileOpen && (
        <div style={{
          position: 'fixed', top: 56, left: 0, right: 0, bottom: 0,
          background: '#fff', zIndex: 998, overflowY: 'auto', padding: '12px 0 40px',
          borderTop: '1px solid #e2e8f0',
        }}>
          {MENUS.map((menu) => (
            <div key={menu.label}>
              <button
                onClick={() => setMobileExpanded(mobileExpanded === menu.label ? null : menu.label)}
                style={{ width: '100%', padding: '14px 20px', border: 'none', background: 'transparent',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 700, color: '#1e293b', cursor: 'pointer' }}>
                {menu.label}
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{mobileExpanded === menu.label ? '▲' : '▼'}</span>
              </button>
              {mobileExpanded === menu.label && (
                <div style={{ background: '#f8fafc', padding: '4px 0' }}>
                  {menu.items.map(item => (
                    <Link key={item.href} href={item.href}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '11px 32px', textDecoration: 'none', fontSize: 14,
                        color: router.pathname === item.href ? '#2563eb' : '#475569',
                        fontWeight: router.pathname === item.href ? 700 : 400 }}>
                      {item.label}
                      {item.badge && (
                        <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 4, background: '#dbeafe', color: '#1d4ed8' }}>
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div style={{ padding: '16px 20px', borderTop: '1px solid #e2e8f0', marginTop: 8 }}>
            <Link href="/pwa" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: 44, borderRadius: 10, background: '#2563eb', color: '#fff',
              textDecoration: 'none', fontWeight: 700, fontSize: 15 }}>
              📱 ONE-HUB 열기
            </Link>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 600px) {
          .nav-hamburger { display: flex !important; }
          nav { display: none !important; }
          a[href="/pwa"][style*="2563eb"] { display: none !important; }
        }
      `}</style>
    </header>
  );
}
