import io

path = r"C:\onehub\one-hub-content\pages\dashboard.js"

with io.open(path, "r", encoding="utf-8") as f:
    content = f.read()

old = '''            <Link href="/history" style={{ color: "var(--color-muted)", fontSize: "0.85rem", textDecoration: "none", ...mono }}>
              AI 분석 히스토리 →
            </Link>'''

new = '''            <Link href="/history" style={{ color: "var(--color-muted)", fontSize: "0.85rem", textDecoration: "none", ...mono }}>
              AI 분석 히스토리 →
            </Link>
            <Link href="/heat-history" style={{ color: "var(--color-muted)", fontSize: "0.85rem", textDecoration: "none", ...mono }}>
              Heat Score History →
            </Link>'''

if old not in content:
    raise SystemExit("OLD STRING NOT FOUND - check encoding")

content = content.replace(old, new)

with io.open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("DONE")
