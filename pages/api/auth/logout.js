// pages/api/auth/logout.js — 세션 쿠키를 지우고 랜딩으로 보낸다.
import { SESSION_COOKIE } from "../../../lib/auth";

export default function handler(req, res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  res.redirect("/");
}
