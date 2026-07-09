// lib/site.js
// 사이트 전역 상수 — canonical/OG/구조화 데이터의 단일 출처.
// 커스텀 도메인(one-hub.kr 등)으로 옮길 때 이 한 줄만 바꾸면 됩니다.
export const SITE = 'https://one-hub-content.vercel.app';

export const SITE_NAME = 'ONE-HUB';
export const ORG_NAME = '머니더버니 · ONE-HUB';

// regime → 표기/이모지/색 매핑 (JSON-LD·OG 이미지 공용)
export const REGIME_KO = { BULL: '상승장', BEAR: '하락장', SIDEWAYS: '횡보장' };
export const REGIME_EMOJI = { BULL: '📈', BEAR: '📉', SIDEWAYS: '➖' };
export const REGIME_ACCENT = { BULL: '#7FE9C0', BEAR: '#FF9BA8', SIDEWAYS: '#9DB6E6' };
