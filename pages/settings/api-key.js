// -*- coding: utf-8 -*-
import Head from "next/head";
import { useState } from "react";

export default function ApiKeySettings() {
  const [inviteCode, setInviteCode] = useState("");
  const [inviteVerified, setInviteVerified] = useState(false);
  const [inviteError, setInviteError] = useState("");

  const [form, setForm] = useState({
    trader_id: "B",
    display_name: "",
    app_key: "",
    app_secret: "",
    account_no: "",
    account_code: "01",
    is_real: false,
    telegram_chat_id: "",
  });
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState("");
  const [masked, setMasked] = useState("");

  const handleInviteCheck = () => {
    const correct = process.env.NEXT_PUBLIC_INVITE_CODE || "";
    if (inviteCode.trim() === correct) {
      setInviteVerified(true);
      setInviteError("");
    } else {
      setInviteError("초대코드가 올바르지 않습니다.");
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const handleSubmit = async () => {
    if (!form.display_name || !form.app_key || !form.app_secret || !form.account_no) {
      setStatus("error");
      setMessage("모든 필수 항목을 입력해주세요.");
      return;
    }
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/trader-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus("success");
        setMasked(data.app_key_masked);
        setMessage("API 키가 안전하게 저장되었습니다.");
        setForm(prev => ({ ...prev, app_key: "", app_secret: "", account_no: "" }));
      } else {
        setStatus("error");
        setMessage(data.error || "알 수 없는 오류가 발생했습니다.");
      }
    } catch (e) {
      setStatus("error");
      setMessage("서버 연결 오류. 잠시 후 다시 시도해주세요.");
    }
  };

  const handleVerify = async () => {
    setStatus("loading");
    setMessage("API 키 검증 중...");
    try {
      const res = await fetch(`/api/trader-verify?trader_id=${form.trader_id}`);
      const data = await res.json();
      if (data.ok) {
        setStatus("success");
        setMessage("✅ API 키 정상 확인! 자동매매 준비 완료입니다.");
      } else {
        setStatus("error");
        setMessage(`키 검증 실패: ${data.error}`);
      }
    } catch (e) {
      setStatus("error");
      setMessage("서버 연결 오류.");
    }
  };

  return (
    <>
      <Head>
        <title>API 키 설정 — ONE-HUB</title>
        <meta name="robots" content="noindex" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;700&display=swap" rel="stylesheet" />
      </Head>

      <div className="page-wrapper">
        <main className="main" style={{ maxWidth: "560px", margin: "0 auto", padding: "2rem 1rem" }}>

          <div style={{ marginBottom: "2rem" }}>
            <h1 style={{ fontFamily: "Syne, sans-serif", fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
              API 키 설정
            </h1>
            <p style={{ fontSize: "0.875rem", color: "var(--color-muted)", lineHeight: 1.7 }}>
              한국투자증권(KIS) API 키를 입력하면 AI가 자동으로 매매를 실행합니다.
            </p>
          </div>

          {/* 초대코드 입력 단계 */}
          {!inviteVerified ? (
            <div style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "14px",
              padding: "1.5rem",
              marginBottom: "1.5rem"
            }}>
              <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "0.5rem", fontFamily: "Syne, sans-serif" }}>
                초대코드 확인
              </div>
              <p style={{ fontSize: "0.8rem", color: "var(--color-muted)", marginBottom: "1rem", lineHeight: 1.6 }}>
                ONE-HUB는 초대받은 분만 참여할 수 있습니다. 운영자에게 받은 초대코드를 입력해주세요.
              </p>
              <input
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleInviteCheck()}
                placeholder="초대코드 입력"
                style={{
                  width: "100%", padding: "10px 12px", borderRadius: "8px",
                  border: "1px solid var(--color-border)", fontSize: "0.9rem",
                  fontFamily: "Space Mono, monospace", marginBottom: "0.75rem"
                }}
              />
              {inviteError && (
                <div style={{ fontSize: "0.8rem", color: "#A32D2D", marginBottom: "0.75rem" }}>
                  {inviteError}
                </div>
              )}
              <button
                onClick={handleInviteCheck}
                style={{
                  width: "100%", padding: "12px", borderRadius: "8px",
                  background: "#1A1A1A", color: "#F8F7F2",
                  border: "none", fontSize: "0.9rem", fontWeight: 600,
                  cursor: "pointer", fontFamily: "Syne, sans-serif"
                }}
              >
                확인
              </button>
            </div>
          ) : (
            <>
              {/* 안내 박스 */}
              <div style={{
                background: "#E6F1FB", border: "1px solid #85B7EB",
                borderRadius: "8px", padding: "1rem", marginBottom: "1.5rem",
                fontSize: "0.8rem", color: "#0C447C", lineHeight: 1.7
              }}>
                <strong>KIS API 발급 안내</strong><br />
                한국투자증권 홈트레이딩 사이트 → KIS Developers에서 API 발급<br />
                App Key + App Secret + 계좌번호를 준비해 주세요.
              </div>

              {/* 폼 */}
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <label style={{ fontSize: "0.8rem", color: "var(--color-muted)", display: "block", marginBottom: "4px" }}>
                    이름 (표시용) *
                  </label>
                  <input name="display_name" value={form.display_name} onChange={handleChange}
                    placeholder="예: 홍길동"
                    style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--color-border)", fontSize: "0.9rem" }} />
                </div>
                <div>
                  <label style={{ fontSize: "0.8rem", color: "var(--color-muted)", display: "block", marginBottom: "4px" }}>App Key *</label>
                  <input name="app_key" value={form.app_key} onChange={handleChange}
                    placeholder="KIS App Key"
                    style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--color-border)", fontSize: "0.9rem", fontFamily: "Space Mono, monospace" }} />
                </div>
                <div>
                  <label style={{ fontSize: "0.8rem", color: "var(--color-muted)", display: "block", marginBottom: "4px" }}>App Secret *</label>
                  <input name="app_secret" type="password" value={form.app_secret} onChange={handleChange}
                    placeholder="KIS App Secret"
                    style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--color-border)", fontSize: "0.9rem", fontFamily: "Space Mono, monospace" }} />
                </div>
                <div>
                  <label style={{ fontSize: "0.8rem", color: "var(--color-muted)", display: "block", marginBottom: "4px" }}>
                    계좌번호 * (숫자만, 앞 8자리)
                  </label>
                  <input name="account_no" value={form.account_no} onChange={handleChange}
                    placeholder="예: 12345678"
                    style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--color-border)", fontSize: "0.9rem", fontFamily: "Space Mono, monospace" }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input type="checkbox" name="is_real" id="is_real" checked={form.is_real} onChange={handleChange} />
                  <label htmlFor="is_real" style={{ fontSize: "0.875rem", color: "var(--color-muted)" }}>
                    실제 계좌로 운영 (체크 해제 시 모의투자)
                  </label>
                </div>
                <div>
                  <label style={{ fontSize: "0.8rem", color: "var(--color-muted)", display: "block", marginBottom: "4px" }}>
                    텔레그램 Chat ID (선택)
                  </label>
                  <input name="telegram_chat_id" value={form.telegram_chat_id} onChange={handleChange}
                    placeholder="텔레그램 알림을 받을 Chat ID"
                    style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--color-border)", fontSize: "0.9rem" }} />
                </div>
              </div>

              {/* 상태 메시지 */}
              {message && (
                <div style={{
                  marginTop: "1rem", padding: "10px 14px", borderRadius: "8px", fontSize: "0.875rem",
                  background: status === "success" ? "#EAF3DE" : status === "error" ? "#FCEBEB" : "#E6F1FB",
                  color: status === "success" ? "#27500A" : status === "error" ? "#791F1F" : "#0C447C",
                  border: `1px solid ${status === "success" ? "#97C459" : status === "error" ? "#F09595" : "#85B7EB"}`,
                }}>
                  {message}
                  {masked && <div style={{ marginTop: "4px", fontFamily: "Space Mono, monospace", fontSize: "0.8rem" }}>App Key: {masked}</div>}
                </div>
              )}

              {/* 버튼 */}
              <div style={{ display: "flex", gap: "8px", marginTop: "1.5rem" }}>
                <button onClick={handleSubmit} disabled={status === "loading"} style={{
                  flex: 1, padding: "12px", borderRadius: "8px",
                  background: "#1A1A1A", color: "#F8F7F2",
                  border: "none", fontSize: "0.9rem", fontWeight: 600,
                  cursor: status === "loading" ? "not-allowed" : "pointer",
                  opacity: status === "loading" ? 0.6 : 1,
                }}>
                  {status === "loading" ? "처리 중..." : "키 암호화 저장"}
                </button>
                <button onClick={handleVerify} disabled={status === "loading"} style={{
                  padding: "12px 20px", borderRadius: "8px",
                  background: "transparent", color: "#1A1A1A",
                  border: "1px solid var(--color-border)",
                  fontSize: "0.9rem", fontWeight: 600,
                  cursor: status === "loading" ? "not-allowed" : "pointer",
                }}>
                  키 검증
                </button>
              </div>

              <p style={{ marginTop: "1rem", fontSize: "0.75rem", color: "var(--color-muted)", lineHeight: 1.7 }}>
                * 입력된 API 키는 AES-256으로 암호화되어 서버 DB에 저장됩니다. 복호화된 원문은 확인할 수 없습니다.
              </p>
            </>
          )}

        </main>
      </div>
    </>
  );
}