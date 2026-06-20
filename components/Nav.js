import Link from "next/link";

import { useRouter } from "next/router";



export default function Nav() {

  const router = useRouter();

  const current = router.pathname;

  const links = [

    ["대시보드", "/"],

    ["Daily", "/daily"],
    ["Blog", "/blog"],

    ["Weekly", "/weekly"],

    ["Engines", "/engines"],

    ["Strategies", "/strategies"],

    ["Community", "/community"],

    ["About", "/about"],

  ];

  return (

    <header style={{

      borderBottom: "1px solid #DCE9F7",

      padding: "0 1.5rem",

      display: "flex",

      alignItems: "center",

      height: "56px",

      background: "rgba(244,249,255,0.97)",

      backdropFilter: "blur(12px)",

      WebkitBackdropFilter: "blur(12px)",

      position: "sticky",

      top: 0,

      zIndex: 100,

    }}>

      <div style={{ display:"flex", alignItems:"center", gap:"24px", width:"100%", maxWidth:"1080px", margin:"0 auto" }}>

        <Link href="/" style={{

          fontFamily: "'Space Mono', monospace",

          fontSize: "14px", fontWeight: 700,

          letterSpacing: "0.08em",

          color: "#16213D",

          textDecoration: "none", flexShrink: 0,

        }}>

          [ONE-HUB]

        </Link>

        <nav style={{ display:"flex", gap:"2px", flexWrap:"nowrap", overflowX:"auto", scrollbarWidth:"none" }}>

          {links.map(([label, href]) => {

            const isActive = href === "/" ? current === "/" : current.startsWith(href);

            return (

              <Link key={href} href={href} style={{

                fontFamily: "'Syne', sans-serif",

                fontSize: "13px", fontWeight: 600,

                padding: "6px 12px",

                borderRadius: "999px",

                color: isActive ? "#F4F9FF" : "#5B7088",

                background: isActive ? "#16213D" : "transparent",

                textDecoration: "none",

                whiteSpace: "nowrap",

                transition: "all 0.15s",

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

