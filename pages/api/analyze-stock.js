export default async function handler(req, res) {
  const { code } = req.query;
  if (!code) return res.status(400).json({ ok: false, error: 'code required' });
  try {
    const upstream = await fetch(
      `http://54.180.54.132:5001/api/analyze/${code}`,
      { headers: { 'x-api-key': process.env.PWA_API_KEY || '' } }
    );
    const data = await upstream.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
}