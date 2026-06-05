
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const GITHUB_REPO  = process.env.GITHUB_REPO || 'inyoung77cho-coder/one-hub-content';

const API_BASE     = `https://api.github.com/repos/${GITHUB_REPO}`;



async function ghFetch(path, options = {}) {

  const res = await fetch(`${API_BASE}${path}`, {

    ...options,

    headers: {

      'Authorization': `Bearer ${GITHUB_TOKEN}`,

      'Accept': 'application/vnd.github+json',

      'Content-Type': 'application/json',

      ...(options.headers || {}),

    },

  });

  if (!res.ok) throw new Error(`GitHub API ${res.status}`);

  return res.json();

}



async function getOrCreateIssue(date) {

  const issues = await ghFetch(`/issues?labels=comment&state=open&per_page=100`);

  const existing = issues.find(i => i.title === `comments:${date}`);

  if (existing) return existing.number;

  const created = await ghFetch('/issues', {

    method: 'POST',

    body: JSON.stringify({

      title: `comments:${date}`,

      body: `ONE-HUB Daily ${date} 댓글 스레드`,

      labels: ['comment'],

    }),

  });

  return created.number;

}



export default async function handler(req, res) {

  const { date } = req.query;

  if (!date) return res.status(400).json({ error: 'date required' });



  if (req.method === 'GET') {

    try {

      const issueNum = await getOrCreateIssue(date);

      const comments = await ghFetch(`/issues/${issueNum}/comments?per_page=100`);

      const result = comments.map(c => {

        try {

          const data = JSON.parse(c.body);

          return { id: c.id, nick: data.nick || '익명', text: data.text || '', ts: data.ts || c.created_at };

        } catch {

          return { id: c.id, nick: '익명', text: c.body, ts: c.created_at };

        }

      });

      return res.status(200).json({ comments: result });

    } catch (e) {

      return res.status(500).json({ error: e.message });

    }

  }



  if (req.method === 'POST') {

    const { nick, text } = req.body || {};

    if (!nick || !text) return res.status(400).json({ error: 'nick, text required' });

    if (text.length > 500) return res.status(400).json({ error: '500자 이하로 작성해주세요' });

    try {

      const issueNum = await getOrCreateIssue(date);

      const body = JSON.stringify({ nick: nick.trim().slice(0, 20), text: text.trim(), ts: new Date().toISOString() });

      const comment = await ghFetch(`/issues/${issueNum}/comments`, {

        method: 'POST',

        body: JSON.stringify({ body }),

      });

      return res.status(201).json({ id: comment.id, nick: nick.trim().slice(0, 20), text: text.trim(), ts: comment.created_at });

    } catch (e) {

      return res.status(500).json({ error: e.message });

    }

  }



  return res.status(405).json({ error: 'method not allowed' });

}

