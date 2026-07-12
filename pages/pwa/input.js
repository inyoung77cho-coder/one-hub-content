// ONE-HUB PWA — 통합 입력 화면(WO-INPUT). 주식/ETF/부동산 간편 입력 + 운영자 신고가.
import Head from "next/head";
import TopNav from "../../components/TopNav";
import InputSheet from "../../components/input/InputSheet";

export default function InputPage() {
  return (
    <>
      <Head><title>자산 입력 · ONE-HUB</title></Head>
      <TopNav />
      <main>
        <InputSheet trader="A" />
      </main>
    </>
  );
}
