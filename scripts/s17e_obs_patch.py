# -*- coding: utf-8 -*-
# S17-0 Part1 후속 — 관측성 3건 패치. 매매 로직 변경 0건.
import io, sys, ast

NL = chr(10)
BS_N = chr(92) + "n"   # 소스에 넣을 리터럴 \n (heredoc 백슬래시 소실 회피)

# ── 1) main.py : _sync_pwa_approvals 조회결과 로그 ──────────────────
p = "main.py"
s = io.open(p, encoding="utf-8", newline="").read()
n0 = len(s)

old_a = (
    '    if not reqs:' + NL +
    '        return' + NL +
    '    for row in reqs:' + NL +
    '        code = row.get("code")' + NL +
    '        status = row.get("status")'
)
new_a = (
    '    if not reqs:' + NL +
    '        return' + NL +
    '    # [S17-0 Part1] 조회 결과를 남긴다. 이 로그가 없어서 2026-07-15 HMM 승인이' + NL +
    "    #   'DB에 안 보인 것'인지 '메모리에 없어 버려진 것'인지 구분할 수 없었다." + NL +
    '    print(f"[v8.3] PWA 승인요청 {len(reqs)}건 조회: "' + NL +
    '          f"{[(r.get(\'code\'), r.get(\'status\')) for r in reqs]}")' + NL +
    '    for row in reqs:' + NL +
    '        code = row.get("code")' + NL +
    '        status = row.get("status")'
)
assert old_a in s, "패치A 앵커 불일치"
s = s.replace(old_a, new_a, 1)

# ── 2) main.py : else 분기(승인이 조용히 폐기되던 지점) 로그 ─────────
old_b = (
    '                else:' + NL +
    '                    # 메모리에 이미 없는 종목(만료/이미처리) → DB만 정리' + NL +
    '                    mark_pending_status(code, TRADER_ID, "expired")'
)
new_b = (
    '                else:' + NL +
    '                    # 메모리에 이미 없는 종목(만료/이미처리) → DB만 정리' + NL +
    "                    # [S17-0 Part1] 여기가 승인이 '조용히' 사라지던 지점." + NL +
    '                    #   로그가 없어 재발해도 감지되지 않았다. 매매 로직은 그대로 두고 기록만 남긴다.' + NL +
    '                    print(f"[v8.3] 승인 요청({code})이 메모리 pending에 없어 만료 처리 "' + NL +
    '                          f"— 현재 pending 보유: {list(pending.keys())}")' + NL +
    '                    mark_pending_status(code, TRADER_ID, "expired")'
)
assert old_b in s, "패치B 앵커 불일치"
s = s.replace(old_b, new_b, 1)

# ── 3) main.py : reset_daily_state 만료 통지 (/skip_all 은 제외) ─────
old_c = (
    '    pending.clear()' + NL +
    '    try:' + NL +
    '        expire_all_pending(TRADER_ID)' + NL +
    '    except Exception as _e:' + NL +
    '        print(f"[v8.3] pending DB 만료처리 실패: {_e}")' + NL +
    '    blocked_today.clear()'
)
new_c = (
    '    pending.clear()' + NL +
    '    try:' + NL +
    '        _expired = expire_all_pending(TRADER_ID)' + NL +
    '        # [S17-0 Part1] 승인 미응답으로 사라진 신호를 사용자가 아침에 즉시 알게 한다.' + NL +
    "        #   2026-06-30 이후 매수 0건의 실체가 '만료 32건'이었고, 아무도 몰랐다." + NL +
    "        #   AUTO_STOP_SELL 12건('30분 미응답')도 같은 뿌리다." + NL +
    '        _buys = [v for v in (_expired or []) if (v.get("action") or "") == "BUY"]' + NL +
    '        if _buys:' + NL +
    '            _lines = "' + BS_N + '".join(' + NL +
    '                f"- {v.get(\'name\') or v.get(\'code\')}({v.get(\'code\')}) "' + NL +
    '                f"{v.get(\'final_score\') if v.get(\'final_score\') is not None else \'-\'}점"' + NL +
    '                for v in _buys[:10])' + NL +
    '            send(f"만료 알림 — 승인 대기 매수 {len(_buys)}건이 응답 없이 만료됐습니다' + BS_N + '"' + NL +
    '                 f"{_lines}' + BS_N + '"' + NL +
    '                 "(승인하지 않으면 체결되지 않습니다. 오늘 신호는 09:00에 다시 안내됩니다.)")' + NL +
    '    except Exception as _e:' + NL +
    '        print(f"[v8.3] pending DB 만료처리 실패: {_e}")' + NL +
    '    blocked_today.clear()'
)
assert old_c in s, "패치C 앵커 불일치"
assert s.count(old_c) == 1, "앵커 중복 — /skip_all 오염 위험"
s = s.replace(old_c, new_c, 1)
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("main.py  : 관측 로그 2 + 만료 통지 1  (+%d bytes)" % (len(s) - n0))

# ── 4) db_logger.py : expire_all_pending 이 무엇을 만료시켰는지 반환 ──
p = "db_logger.py"
s = io.open(p, encoding="utf-8", newline="").read()
n0 = len(s)
old_d = (
    'def expire_all_pending(trader_id: str = "A") -> None:' + NL +
    '    """자정 리셋(reset_daily_state) 시 남은 pending_signals 일괄 만료 처리."""' + NL +
    '    conn = sqlite3.connect(DB_PATH)' + NL +
    '    c = conn.cursor()' + NL +
    '    c.execute("""' + NL +
    "        UPDATE pending_signals SET status='expired', updated_at=?" + NL +
    "        WHERE trader_id=? AND status NOT IN ('done','rejected','expired','queued')" + NL +
    '    """, (now_kst_str(), trader_id))' + NL +
    '    conn.commit()' + NL +
    '    conn.close()'
)
new_d = (
    'def expire_all_pending(trader_id: str = "A") -> list:' + NL +
    '    """자정 리셋(reset_daily_state) 시 남은 pending_signals 일괄 만료 처리.' + NL +
    '' + NL +
    "    [S17-0 Part1] 만료 '조건'은 바꾸지 않는다 — 만료는 버그가 아니라 안전장치다" + NL +
    '      (오래된 신호가 며칠 뒤 다른 가격에 체결되는 것을 막는다).' + NL +
    '      문제는 만료된 사실을 아무도 몰랐다는 것 → 무엇을 만료시켰는지 반환·기록한다.' + NL +
    '      기존 호출부는 반환값을 무시해도 동작이 동일하다.' + NL +
    '    """' + NL +
    '    conn = sqlite3.connect(DB_PATH)' + NL +
    '    conn.row_factory = sqlite3.Row' + NL +
    '    c = conn.cursor()' + NL +
    '    cond = "trader_id=? AND status NOT IN (\'done\',\'rejected\',\'expired\',\'queued\')"' + NL +
    '    victims = [dict(r) for r in c.execute(' + NL +
    '        f"SELECT code, name, action, status, final_score FROM pending_signals WHERE {cond}",' + NL +
    '        (trader_id,)).fetchall()]' + NL +
    '    c.execute(f"UPDATE pending_signals SET status=\'expired\', updated_at=? WHERE {cond}",' + NL +
    '              (now_kst_str(), trader_id))' + NL +
    '    conn.commit()' + NL +
    '    conn.close()' + NL +
    '    if victims:' + NL +
    '        print(f"[S17-0] pending 만료 {len(victims)}건 (trader={trader_id}): "' + NL +
    '              f"{[(v[\'code\'], v[\'status\']) for v in victims]}")' + NL +
    '    return victims'
)
assert old_d in s, "패치D 앵커 불일치"
s = s.replace(old_d, new_d, 1)
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("db_logger.py: expire_all_pending 반환·로그  (+%d bytes)" % (len(s) - n0))

# ── 문법 검증 ───────────────────────────────────────────────────────
for f in ("main.py", "db_logger.py"):
    ast.parse(io.open(f, encoding="utf-8").read())
    print("AST OK  " + f)
