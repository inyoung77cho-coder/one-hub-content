module.exports = [
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/pages-api-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/pages-api-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/pages-api-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/pages-api-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[project]/pages/api/engine-status.js [api] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>handler
]);
const ENGINE_API = process.env.ENGINE_API_URL || "http://54.180.54.132:5001";
async function handler(req, res) {
    if (req.method !== "GET") return res.status(405).json({
        error: "Method not allowed"
    });
    try {
        const upstream = await fetch(`${ENGINE_API}/api/engine-status`, {
            signal: AbortSignal.timeout(8000)
        });
        if (!upstream.ok) throw new Error(`Upstream error: ${upstream.status}`);
        const data = await upstream.json();
        res.setHeader("Cache-Control", "no-store");
        return res.status(200).json(data);
    } catch (err) {
        console.error("Engine API unreachable:", err.message);
        return res.status(200).json({
            _offline: true,
            timestamp: new Date().toISOString(),
            engine: {
                is_active: false,
                status: "offline",
                process_count: 0
            },
            holdings: [],
            schedule: [],
            strategy: [],
            version: "v8.0"
        });
    }
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__0qvuh-u._.js.map