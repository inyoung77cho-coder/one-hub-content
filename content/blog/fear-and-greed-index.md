---
title: "Fear & Greed Index란? AI 매매 시스템이 이 지수를 보는 이유"
date: "2026-06-06"
slug: "fear-and-greed-index"
description: "CNN Fear & Greed Index가 무엇인지, 그리고 ONE-HUB AI 엔진이 이 지수를 어떻게 활용하는지 설명합니다."
tags: ["Fear&Greed", "시장심리", "AI매매", "지표설명"]
---

## Fear & Greed Index란?

CNN Money가 매일 산출하는 시장 심리 지수입니다. 0에 가까울수록 극단적 공포, 100에 가까울수록 극단적 탐욕을 의미합니다.

| 구간 | 심리 상태 |
|------|-----------|
| 0~24 | Extreme Fear (극단적 공포) |
| 25~44 | Fear (공포) |
| 45~55 | Neutral (중립) |
| 56~74 | Greed (탐욕) |
| 75~100 | Extreme Greed (극단적 탐욕) |

## 7가지 구성 요소

Fear & Greed Index는 단일 지표가 아니라 7가지 시장 데이터를 합산한 복합 지수입니다.

1. **Stock Price Momentum** — S&P500의 125일 이동평균 대비 현재가
2. **Stock Price Strength** — 52주 신고가/신저가 비율
3. **Stock Price Breadth** — 상승 종목 vs 하락 종목 거래량 비율
4. **Put/Call Ratio** — 풋 옵션 대비 콜 옵션 비율
5. **Junk Bond Demand** — 정크본드와 국채 수익률 스프레드
6. **Market Volatility** — VIX 지수 (공포 지수)
7. **Safe Haven Demand** — 주식 대비 채권 수익률 비율

## ONE-HUB는 이 지수를 어떻게 활용하나?

ONE-HUB AI 엔진은 Fear & Greed Index를 Market Heat Score 계산에 직접 반영합니다.

- **지수 12 (Extreme Fear)**: Market Heat 0/100 → 신규 매수 전면 차단
- **지수 25~44 (Fear)**: Heat 낮게 유지 → 선별적 진입만 허용
- **지수 45~55 (Neutral)**: 정상 운영 → 기술적 지표 중심 판단
- **지수 56 이상 (Greed)**: 과열 경고 → 익절 우선 전략으로 전환

## 왜 공포 구간에서 매매를 줄이나?

반대로 생각하면 "공포 구간이 저점 매수 기회 아닌가?"라는 질문이 생깁니다.

맞습니다. 하지만 **언제가 바닥인지는 아무도 모릅니다.**

ONE-HUB의 철학은 수익 극대화보다 손실 최소화입니다. 극단적 공포 구간에서는 추가 하락 리스크가 반등 기대보다 크다고 판단하여 시스템이 진입을 차단합니다.

2026년 6월 첫 주, Fear & Greed 지수는 12(Extreme Fear)를 기록했습니다. ONE-HUB는 이 기간 대부분의 진입 신호를 차단하고 자본을 보존했습니다.

> 매매를 안 한 것이 전략입니다.

---

*실제 운용 결과는 [Daily Report](/daily)에서 매일 확인할 수 있습니다.*