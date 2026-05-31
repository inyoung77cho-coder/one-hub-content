import Link from "next/link";
import { useRouter } from "next/router";

export default function Nav() {
  const router = useRouter();
  const current = router.pathname;

  const links = [
    ["대시보드", "/"],
    ["Daily", "/daily"],
    ["Weekly", "/weekly"],
    ["Engines", "/engines"],
    ["Strategies", "/strategies"],
    ["Community", "/community"],
    ["About", "/about"],
  ];

  return (
    <header style={{
      borderBottom: "1px solid #1e2530",
      padding: "16px 32px",
      display: "flex",
      alignItems: "center",
      background: "#0f1218",
      position: "sticky",
      top: 0,
      zIndex: 100,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "24px", flexWrap: "wrap" }}>
        <Link href="/" style={{
          fontFamily: "monospace", fontSize: "13px", fontWeight: 700,
          letterSpacing: "0.15em", color: "#8a9ab5", textDecoration: "none", flexShrink: 0,
        }}>
          ONE-<span style={{ color: "#00d084" }}>HUB</span>
        </Link>
        <nav style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          {links.map(([label, href]) => {
            const isActive = href === "/" ? current === "/" : current.startsWith(href);
            return (
              <Link key={href} href={href} style={{
                fontFamily: "monospace", fontSize: "11px",
                color: isActive ? "#00d084" : "#4a5568",
                textDecoration: "none", letterSpacing: "0.1em",
                fontWeight: isActive ? 700 : 400,
              }}>
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
