# -*- coding: utf-8 -*-
# claude_text.py — Claude 응답 텍스트 안전 추출
# ============================================================
# 배경: 최신 anthropic SDK(0.117+) + 최신 모델(sonnet-5 / opus-4.x)은
#   응답 content 에 ThinkingBlock(사고과정)과 TextBlock(실제 답)을 함께 담는다.
#   content[0] 이 ThinkingBlock 이면 .text 속성이 없어
#   'ThinkingBlock' object has no attribute 'text' 로 터진다.
#
# 해결: content[0] 을 무조건 읽지 말고, .text 가 있는 블록만 골라 이어붙인다.
#
# ★ 이 파일은 두 곳에 "동일 사본"으로 존재한다 (flat per-file 배포 구조 때문):
#     - one-hub-content/claude_text.py             (root / GitHub Actions)
#     - one-hub-content/auto_trade/claude_text.py  (server 엔진)
#   한쪽을 고치면 반드시 다른 쪽도 같은 내용으로 맞춘다.
#
# 배포(서버): 이 파일을 이를 import 하는 스크립트보다 "먼저" 배포한다.
#   각 호출부에는 동일한 안전 폴백이 있어 이 모듈이 없어도 버그 없이 동작한다.
# ============================================================


def extract_text(message):
    """Claude 응답 message 에서 텍스트만 안전하게 추출한다.

    ThinkingBlock 등 .text 속성이 없는 블록은 건너뛴다.
    content 가 [ThinkingBlock, TextBlock, ...] 형태여도 안전하다.
    """
    parts = []
    for block in getattr(message, "content", None) or []:
        t = getattr(block, "text", None)
        if t:
            parts.append(t)
    return "".join(parts)
