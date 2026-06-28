import Head from "next/head";

import Link from "next/link";

import fs from "fs";

import path from "path";

import matter from "gray-matter";

import { useState, useEffect } from "react";



export default function DailyIndex({ posts, postsB }) {

  const [isMobile, setIsMobile] = useState(false);
  const [trader, setTrader] = useState("A");
  const activePosts = trader === "A" ? posts : (postsB || []);

  useEffect(() => {

    const check = () => setIsMobile(window.innerWidth < 640);

    check();

    window.addEventListener("resize", check);

    return () => window.removeEventListener("resize", check);

  }, []);



  const regimeColor = (r) => {

    if (r === "BULL") return "#e53e3e";

    if (r === "BEAR") return "#3182ce";

    return "#718096";

  };

  const regimeEmoji = (r) => {

    if (r === "BULL") return "▲";

    if (r === "BEAR") return "▼";

    return "➖";

  };



  return (

    <>

      <Head>

        <title>Daily Reports — ONE-HUB</title>

        <meta name="description" content="ONE-HUB AI 자동매매 일일 운영일지. 매일 15:30 KST 시장 분석과 AI 판단 과정을 공개합니다." />

        <meta name="viewport" content="width=device-width, initial-scale=1" />

        <meta property="og:title" content="Daily Reports — ONE-HUB" />

        <meta property="og:description" content="ONE-HUB AI 자동매매 일일 운영일지. 매일 15:30 KST 시장 분석과 AI 판단 과정을 공개합니다." />

        <meta property="og:url" content="https://one-hub-content.vercel.app/daily" />

        <meta property="og:type" content="website" />

        <meta property="og:site_name" content="ONE-HUB" />

        <meta name="twitter:card" content="summary" />

        <meta name="twitter:title" content="Daily Reports — ONE-HUB" />

        <meta name="twitter:description" content="ONE-HUB AI 자동매매 일일 운영일지. 매일 15:30 KST 시장 분석과 AI 판단 과정을 공개합니다." />

      </Head>

      <div style={{ minHeight: "100vh", background: "#F8F7F2", color: "#1a202c", fontFamily: "'Noto Sans KR', sans-serif", padding: "0 0 80px" }}>

        <main style={{ maxWidth: "800px", margin: "0 auto", padding: isMobile ? "24px 16px" : "40px 24px" }}>

          <h1 style={{ fontFamily: "monospace", fontSize: "13px", letterSpacing: "0.2em", color: "#718096", textTransform: "uppercase", marginBottom: "32px" }}>

            Daily Operations Log

          </h1>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

            {activePosts.map((post, i) => {
              const isToday = post.date === new Date().toISOString().split("T")[0];
              return (
              <Link key={post.date} href={`/daily/${post.date}`} style={{ textDecoration: "none" }}>

                {isMobile ? (

                  <div style={{ background: isToday ? "#f0f6ff" : "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "16px 18px", cursor: "pointer" }}

                    onMouseEnter={e => e.currentTarget.style.borderColor = "#cbd5e0"}

                    onMouseLeave={e => e.currentTarget.style.borderColor = "#e2e8f0"}>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>

                      <span style={{ fontFamily: "monospace", fontSize: "13px", fontWeight: 700, color: "#1e293b" }}>
                        {post.date}
                        {isToday && <span style={{ background:'#2563eb', color:'#fff', fontSize:10, padding:'2px 8px', borderRadius:10, marginLeft:8 }}>NEW</span>}
                      </span>

                      <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#a0aec0" }}>{post.trade_count}건</span>

                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>

                      <span style={{ fontFamily: "monospace", fontSize: "11px", fontWeight: 700, color: regimeColor(post.regime) }}>

                        {regimeEmoji(post.regime)} {post.regime}

                      </span>

                      <span style={{ fontSize: "11px", color: "#a0aec0" }}>· Heat {post.heat_score}</span>

                    </div>

                    <p style={{ fontSize: "12px", color: "#718096", margin: 0, lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>

                      {post.insight}

                    </p>

                  </div>

                ) : (

                  <div style={{ background: isToday ? "#f0f6ff" : "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "20px 24px", display: "grid", gridTemplateColumns: "40px 160px 1fr auto", alignItems: "center", gap: "16px", cursor: "pointer" }}

                    onMouseEnter={e => e.currentTarget.style.borderColor = "#cbd5e0"}

                    onMouseLeave={e => e.currentTarget.style.borderColor = "#e2e8f0"}>

                    <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#a0aec0" }}>{String(i + 1).padStart(2, "0")}</span>

                    <span style={{ fontFamily: "monospace", fontSize: "13px", fontWeight: 700, color: "#1e293b" }}>
                      {post.date}
                      {isToday && <span style={{ background:'#2563eb', color:'#fff', fontSize:10, padding:'2px 8px', borderRadius:10, marginLeft:8 }}>NEW</span>}
                    </span>

                    <div>

                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>

                        <span style={{ fontFamily: "monospace", fontSize: "11px", fontWeight: 700, color: regimeColor(post.regime) }}>

                          {regimeEmoji(post.regime)} {post.regime}

                        </span>

                        <span style={{ fontSize: "11px", color: "#a0aec0" }}>· Heat {post.heat_score}</span>

                      </div>

                      <p style={{ fontSize: "12px", color: "#718096", margin: 0, lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical" }}>

                        {post.insight}

                      </p>

                    </div>

                    <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#a0aec0" }}>{post.trade_count}건</span>

                  </div>

                )}

              </Link>
              );
            })}

          </div>

        </main>

      </div>

    </>
  );



}



export async function getStaticProps() {
  const contentDir = path.join(process.cwd(), "content", "daily");
  let posts = [];
  try {
    const files = fs.readdirSync(contentDir).filter(f => f.endsWith(".md")).sort().reverse();
    posts = files.map(file => {
      const raw = fs.readFileSync(path.join(contentDir, file), "utf-8");
      const { data } = matter(raw);
      return {
        date: data.date || file.replace(".md", ""),
        regime: data.regime || "SIDEWAYS",
        heat_score: data.heat_score || 50,
        insight: data.insight || "",
        trade_count: data.trade_count || 0,
      };
    });
  } catch (e) {}
  // Trader B
  const contentDirB = path.join(process.cwd(), "content", "daily-b");
  let postsB = [];
  try {
    const filesB = fs.readdirSync(contentDirB).filter(f => f.endsWith(".md")).sort().reverse();
    postsB = filesB.map(file => {
      const raw = fs.readFileSync(path.join(contentDirB, file), "utf-8");
      const { data } = matter(raw);
      return {
        date: data.date || file.replace(".md", ""),
        regime: data.regime || "SIDEWAYS",
        heat_score: data.heat_score || 50,
        insight: data.insight || "",
        trade_count: data.trade_count || 0,
      };
    });
  } catch (e) {}
  return { props: { posts, postsB } };
}
