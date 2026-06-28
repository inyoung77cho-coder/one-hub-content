import Head from "next/head";
import CTABar from "../../components/CTABar";
import Link from "next/link";

import fs from "fs";

import path from "path";

import matter from "gray-matter";

import { useState, useEffect } from "react";



export default function DailyIndex({ posts, postsB }) {

  const [isMobile, setIsMobile] = useState(false);
  const [trader, setTrader] = useState("A");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRegime, setSelectedRegime] = useState("ALL");
  const activePosts = trader === "A" ? posts : (postsB || []);

  // 검색 + regime 필터
  const filteredPosts = activePosts.filter(p => {
    const matchRegime = selectedRegime === "ALL" || p.regime === selectedRegime;
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || p.date?.includes(q) || p.insight?.toLowerCase().includes(q) || p.regime?.toLowerCase().includes(q);
    return matchRegime && matchSearch;
  });

  // 월별 그룹핑
  const grouped = filteredPosts.reduce((acc, post) => {
    const month = post.date?.substring(0, 7) || "기타";
    if (!acc[month]) acc[month] = [];
    acc[month].push(post);
    return acc;
  }, {});
  const months = Object.keys(grouped).sort().reverse();

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

          <h1 style={{ fontFamily: "monospace", fontSize: "13px", letterSpacing: "0.2em", color: "#718096", textTransform: "uppercase", marginBottom: "24px" }}>
            Daily Operations Log
          </h1>

          {/* Trader 전환 */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {["A", "B"].map(t => (
              <button key={t} onClick={() => setTrader(t)}
                style={{ padding: "5px 16px", borderRadius: 6, border: "1px solid #e2e8f0",
                  background: trader === t ? "#1e293b" : "#fff", color: trader === t ? "#fff" : "#64748b",
                  cursor: "pointer", fontFamily: "monospace", fontSize: "11px", fontWeight: trader === t ? 700 : 400 }}>
                Trader {t}
              </button>
            ))}
          </div>

          {/* ① 검색 입력 */}
          <input
            type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="날짜 또는 키워드 검색 (예: 2026-06, BEAR)"
            style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #e2e8f0",
              fontSize: "13px", fontFamily: "monospace", background: "#fff", color: "#1e293b",
              boxSizing: "border-box", marginBottom: 12, outline: "none" }}
          />

          {/* ② Regime 필터 */}
          <div style={{ display: "flex", gap: 6, marginBottom: 24, flexWrap: "wrap", alignItems: "center" }}>
            {["ALL", "BULL", "BEAR", "SIDEWAYS"].map(r => (
              <button key={r} onClick={() => setSelectedRegime(r)}
                style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #e2e8f0",
                  background: selectedRegime === r ? "#1e293b" : "#fff",
                  color: selectedRegime === r ? "#fff" : "#718096",
                  cursor: "pointer", fontFamily: "monospace", fontSize: "11px", fontWeight: selectedRegime === r ? 700 : 400 }}>
                {r === "ALL" ? "전체" : r}
              </button>
            ))}
            <span style={{ marginLeft: "auto", fontFamily: "monospace", fontSize: "11px", color: "#a0aec0" }}>
              {filteredPosts.length}일
            </span>
          </div>

          {/* ③ 월별 그룹 리스트 */}
          {months.map(month => (
            <div key={month} style={{ marginBottom: 32 }}>
              <div style={{ fontFamily: "monospace", fontSize: "11px", color: "#718096", marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid #e2e8f0" }}>
                {month.replace("-", "년 ")}월 ({grouped[month].length}개)
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

          {grouped[month].map((post, i) => {
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
            </div>
          ))}
          {filteredPosts.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#a0aec0", fontFamily: "monospace", fontSize: "12px" }}>
              검색 결과가 없습니다.
            </div>
          )}
          <CTABar />
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
