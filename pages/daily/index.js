import Head from "next/head";
import Link from "next/link";
import fs from "fs";
import path from "path";
import matter from "gray-matter";

export default function DailyIndex({ posts }) {
  const regimeColor = (r) => {
    if (r === "BULL") return "#ff4757";
    if (r === "BEAR") return "#4fa3e0";
    return "#8a9ab5";
  };
  const regimeEmoji = (r) => {
    if (r === "BULL") return "▲";
    if (r === "BEAR") return "▼";
    return "➖";
  };

  return (
    <>
      <Head><title>Daily Reports — ONE-HUB</title></Head>
      <div style={{ minHeight: "100vh", background: "#0a0c10", color: "#e8edf5", fontFamily: "'Noto Sans KR', sans-serif", padding: "0 0 80px" }}>
        <main style={{ maxWidth: "800px", margin: "0 auto", padding: "40px 24px" }}>
          <h1 style={{ fontFamily: "monospace", fontSize: "13px", letterSpacing: "0.2em", color: "#4a5568", textTransform: "uppercase", marginBottom: "32px" }}>
            Daily Operations Log
          </h1>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {posts.map((post, i) => (
              <Link key={post.date} href={`/daily/${post.date}`} style={{ textDecoration: "none" }}>
                <div style={{ background: "#0f1218", border: "1px solid #1e2530", borderRadius: "10px", padding: "18px 20px", display: "grid", gridTemplateColumns: "40px 120px 1fr auto", alignItems: "center", gap: "16px", cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "#2a3344"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "#1e2530"}>
                  <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#4a5568" }}>{String(i + 1).padStart(2, "0")}</span>
                  <span style={{ fontFamily: "monospace", fontSize: "12px", color: "#8a9ab5" }}>{post.date}</span>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                      <span style={{ fontFamily: "monospace", fontSize: "11px", fontWeight: 700, color: regimeColor(post.regime) }}>
                        {regimeEmoji(post.regime)} {post.regime}
                      </span>
                      <span style={{ fontSize: "11px", color: "#4a5568" }}>· Heat {post.heat_score}</span>
                    </div>
                    <p style={{ fontSize: "12px", color: "#8a9ab5", margin: 0, lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical" }}>
                      {post.insight}
                    </p>
                  </div>
                  <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#4a5568" }}>{post.trade_count}건</span>
                </div>
              </Link>
            ))}
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
  return { props: { posts } };
}
