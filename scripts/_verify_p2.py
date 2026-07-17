# -*- coding: utf-8 -*-
"""S18 Part2 검산 — /api/ai/stats 스키마·정합성 (지시서 W2-9의 13개 검산식)."""
import sys, json, urllib.request

d = json.load(urllib.request.urlopen('http://localhost:5001/api/ai/stats?trader=A', timeout=10))
f = 0


def chk(c, m):
    global f
    print(('OK   ' if c else 'FAIL ') + m)
    if not c:
        f += 1


s, v, t, b = d['sample'], d['vs_ai'], d['today'], d['block']
chk(d.get('integrity') == 'OK', 'integrity OK')
chk('auto_mode' in d, 'auto_mode 필드 (B-1 근거)')
chk('interested' in t, 'today.interested 필드')
chk('not_bought_reason' in t, 'not_bought_reason 필드')
chk(t['screened'] >= t['interested'], 'screened >= interested')
chk(t['screened'] >= t['candidates'] >= t['blocked'] + t['bought'], '깔때기 정합')
chk(s['verified'] <= s['judgments_total'], 'verified <= judgments_total')
chk(v['win'] + v['lose'] == v['scored'], 'win+lose == scored')
chk(b['hit'] <= b['verified'], 'hit <= verified')
chk(sum(r['total'] for r in d['reason_accuracy']) == b['verified'], '사유별 합 == verified')
chk(s['phase'] == ('official' if s['verified'] >= s['target'] else 'learning'), 'phase 자동판정')
chk(b['hit_rate_locked'] == (s['verified'] < 50), '적중률 50건 잠금')
chk(not (d['auto_mode'] is False and t['bought'] > 0), '자율모드 OFF인데 매수 발생 없음')

print('  실측: verified %d · hit_rate %s · blocked %d · auto_mode %s · reason=%s'
      % (s['verified'], b['hit_rate'], t['blocked'], d['auto_mode'], t['not_bought_reason']))
sys.exit(f)
