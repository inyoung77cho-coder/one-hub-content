import "../styles/globals.css";
import Nav from "../components/Nav";
import Head from "next/head";

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <meta name="google-site-verification" content="Sqkl2VEdEQR2Calqdn4Fxa4QzLTk56dNTvpJBaMuIEs" />
      </Head>
      <Nav />
      <Component {...pageProps} />
    </>
  );
}