export default function CTABar() {
  const buttons = [
    { label: "📱 PWA 설치",  href: "/pwa-guide",                    external: false },
    { label: "✈️ 텔레그램", href: "https://t.me/onehub_jiy_bot",   external: true  },
    { label: "📊 추천 보기", href: "/pwa",                           external: false },
    { label: "📋 Weekly",    href: "/weekly",                        external: false },
  ];

  return (
    <div style={{
      background: "#f0f6ff", border: "1px solid #dbeafe",
      borderRadius: 16, padding: "24px 20px", margin: "40px 0 24px", textAlign: "center",
    }}>
      <p style={{ fontSize: "0.95rem", fontWeight: 700, color: "#1e40af", marginBottom: 16, marginTop: 0 }}>
        ONE-HUB를 앱으로 사용하세요
      </p>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10,
        maxWidth: 400, margin: "0 auto",
      }}>
        {buttons.map(({ label, href, external }) => (
          <a key={label} href={href}
            target={external ? "_blank" : undefined}
            rel={external ? "noopener noreferrer" : undefined}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              height: 44, borderRadius: 10, fontSize: "0.85rem", fontWeight: 600,
              textDecoration: "none", background: "#2563eb", color: "#fff",
            }}
          >
            {label}
          </a>
        ))}
      </div>
    </div>
  );
}
