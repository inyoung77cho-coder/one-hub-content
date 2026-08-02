// pages/privacy.js — 개인정보 처리방침. 서비스가 실제로 수집·처리·위탁하는 항목에 맞춰 정식 수준으로 보강.
//   ※ 정식 상용 출시 전 법률 전문가 최종 검토 권장(보호책임자 연락처·보관기간 등 확정).
import Head from "next/head";
import Link from "next/link";

const UPDATED = "2026-07-25";

export default function Privacy() {
  return (
    <>
      <Head>
        <title>개인정보 처리방침 · ONE·HUB</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main className="doc">
        <h1>개인정보 처리방침</h1>
        <p className="meta">ONE·HUB(이하 “서비스”) · 시행일 {UPDATED} · <b>베타(시험) 서비스</b></p>

        <p className="lead">
          ONE·HUB는 이용자의 개인정보를 중요하게 생각하며, 「개인정보 보호법」·「정보통신망 이용촉진 및 정보보호 등에 관한
          법률」 등 관련 법령을 준수합니다. 본 방침은 서비스가 실제로 수집·이용·보관하는 개인정보를 설명하며, 서비스 개선에
          따라 개정될 수 있습니다.
        </p>

        <h2>1. 수집하는 개인정보 항목</h2>
        <p className="sub">가. 회원가입·로그인 (필수)</p>
        <ul>
          <li>카카오 로그인 제공 정보: <b>카카오 회원번호</b>, <b>닉네임</b></li>
          <li>이메일: 이용자가 카카오에서 제공에 동의한 경우에만(선택)</li>
        </ul>
        <p className="sub">나. 이용자가 직접 입력하는 정보</p>
        <ul>
          <li>보유 자산 정보: 관심단지·보유 종목/ETF·부동산 보유·현금·투자성향 등</li>
          <li>피드백으로 남긴 내용</li>
        </ul>
        <p className="sub">다. 서비스 이용 과정에서 자동 수집되는 정보</p>
        <ul>
          <li>접속 로그·접속 IP 주소(부정 이용 방지·오류 대응 목적)</li>
          <li>웹푸시 알림 구독 정보(브라우저가 발급한 푸시 엔드포인트·키) — 알림을 켠 경우</li>
          <li>세션 유지를 위한 로그인 쿠키(oh_session)</li>
        </ul>

        <h2>2. 수집·이용 목적</h2>
        <ul>
          <li>회원 식별·로그인 및 계정별 데이터 분리 제공</li>
          <li>자산 통합·AI 분석·관심단지 알림 등 서비스 기능 제공 및 개선</li>
          <li>여러 기기 간 입력 자산의 동기화</li>
          <li>피드백 응대, 공지·오류 대응, 부정 이용 방지</li>
        </ul>

        <h2>3. 마케팅 정보 수신 (선택 동의)</h2>
        <p>
          이용자가 <b>마케팅 정보 수신에 동의</b>한 경우에 한해, 서비스 소식·혜택 등 광고성 정보를 발송할 수 있습니다
          (「정보통신망법」 제50조). 이 동의는 서비스 이용의 필수 조건이 아니며, <b>설정 → 약관·개인정보·면책 → 동의 항목
          관리</b>에서 언제든지 철회할 수 있습니다. 철회 후에도 서비스 이용에는 제한이 없습니다.
        </p>

        <h2>4. 보유 및 이용 기간</h2>
        <p>
          원칙적으로 <b>회원 탈퇴 시까지</b> 보유하며, 탈퇴·삭제 요청 시 지체 없이 파기합니다. 다만 관련 법령에서 보존을
          요구하는 경우 해당 기간 동안 보관합니다. 접속 로그 등 자동 수집 정보는 목적 달성 후 순차 파기합니다.
        </p>

        <h2>5. 처리 위탁 및 국외 이전</h2>
        <p>서비스는 원활한 운영을 위해 아래와 같이 개인정보 처리를 위탁하며, 위탁 업무 범위 내에서만 정보가 이용됩니다.</p>
        <ul>
          <li><b>카카오(주)</b> — 소셜 로그인(인증)</li>
          <li><b>Vercel Inc.</b> — 웹 프론트엔드·API 호스팅(국외)</li>
          <li><b>Amazon Web Services(AWS Lightsail)</b> — 서버·데이터베이스 운영</li>
          <li><b>GitHub, Inc.</b> — 이용자가 제출한 피드백 내용의 저장·관리(국외)</li>
        </ul>
        <p className="fine">위탁·국외 이전 대상이 변경될 경우 본 방침을 통해 고지합니다.</p>

        <h2>6. 제3자 제공</h2>
        <p>서비스는 이용자의 개인정보를 제3자에게 판매·제공하지 않습니다. 다만 법령에 근거가 있거나 수사기관의 적법한 요청이
          있는 경우 관련 법령이 정한 절차에 따라 제공할 수 있습니다.</p>

        <h2>7. 파기</h2>
        <p>보유 기간 경과 또는 처리 목적 달성 시 지체 없이 파기합니다. 전자적 파일은 복구가 불가능한 방법으로 삭제합니다.</p>

        <h2>8. 이용자와 법정대리인의 권리</h2>
        <p>이용자는 언제든지 본인 정보의 <b>열람·정정·삭제·처리정지</b> 및 <b>회원 탈퇴</b>를 요청할 수 있습니다. 서비스는
          만 14세 미만 아동의 가입을 원칙적으로 받지 않습니다.</p>

        <h2>9. 쿠키 등 자동 수집 장치</h2>
        <p>로그인 상태 유지를 위해 세션 쿠키(oh_session)를 사용합니다. 이용자는 브라우저 설정에서 쿠키 저장을 거부할 수
          있으나, 이 경우 로그인 등 일부 기능 이용이 제한될 수 있습니다. 웹푸시 알림은 브라우저·기기 설정에서 언제든 끌 수
          있습니다.</p>

        <h2>10. 안전성 확보 조치</h2>
        <ul>
          <li>계정별 데이터 분리(테넌트 격리) 및 서버 측 접근 통제</li>
          <li>전송 구간 암호화(HTTPS) 적용</li>
          <li>로그인 세션의 서명·만료 관리</li>
        </ul>

        <h2>11. 개인정보 보호책임자 및 문의</h2>
        <p>개인정보 관련 열람·정정·삭제·탈퇴·문의는 아래로 접수합니다.</p>
        <ul>
          <li>문의 채널: 서비스 내 <b>💬 피드백</b></li>
          <li>보호책임자: ONE·HUB</li>
        </ul>
        <p className="fine">개인정보 침해에 대한 신고·상담은 개인정보침해신고센터(privacy.kisa.or.kr, 국번없이 118),
          대검찰청·경찰청 사이버수사대 등에 문의할 수 있습니다.</p>

        <h2>12. 처리방침의 변경</h2>
        <p>본 방침은 법령·서비스 변경에 따라 개정될 수 있으며, 변경 시 시행일과 내용을 서비스 내에 고지합니다.</p>

        <p className="foot"><Link href="/terms">이용약관</Link> · <Link href="/disclaimer">투자 유의·면책</Link> · <Link href="/">홈으로</Link></p>
      </main>
      <style jsx>{`
        .doc { max-width: 720px; margin: 0 auto; padding: 32px 20px 60px; color: #1e293b; font-size: 0.92rem; line-height: 1.7; }
        h1 { font-size: 1.4rem; font-weight: 900; margin: 0 0 4px; }
        .meta { color: #64748b; font-size: 0.8rem; margin: 0 0 18px; }
        .lead { background: #f8fafc; border-radius: 10px; padding: 14px 16px; color: #334155; }
        h2 { font-size: 1rem; font-weight: 800; margin: 22px 0 6px; }
        .sub { font-weight: 700; color: #475569; margin: 10px 0 2px; font-size: 0.9rem; }
        ul { margin: 6px 0; padding-left: 18px; }
        li { margin-bottom: 4px; }
        .fine { font-size: 0.82rem; color: #64748b; }
        .foot { margin-top: 30px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 0.85rem; }
        a { color: #4f46e5; }
      `}</style>
    </>
  );
}
