const db = require('./db');
const { j, toUser, toResource, toSubmission } = require('./util');

function leaderboard(programId) {
  const rows = db.prepare(`
    SELECT u.id, u.name, COALESCE(SUM(CASE WHEN s.status='graded' THEN s.score END),0) AS points
    FROM users u LEFT JOIN submissions s ON s.user_id = u.id
    WHERE u.role='mentee' ${programId ? 'AND u.program_id = ?' : ''}
    GROUP BY u.id ORDER BY points DESC, u.name ASC`).all(...(programId ? [programId] : []));
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

// Rule-based profile; same shape the frontend expects.
function ruleProfile(userId) {
  const u = toUser(db.prepare('SELECT * FROM users WHERE id=? AND role=?').get(userId, 'mentee'));
  if (!u) return null;
  const rs = db.prepare('SELECT * FROM resources WHERE program_id=?').all(u.programId).map(toResource);
  const ss = db.prepare('SELECT * FROM submissions WHERE user_id=?').all(userId).map(toSubmission);
  const me = leaderboard(u.programId).find(r => r.id === userId) || {};
  const rank = me.rank || 0;
  const by = t => {
    const R = rs.filter(r => r.type === t);
    const S = ss.filter(s => R.some(r => r.id === s.resourceId));
    const g = S.filter(s => s.status === 'graded');
    const max = g.reduce((a, s) => a + R.find(r => r.id === s.resourceId).maxScore, 0);
    return { done: S.length, pct: R.length ? Math.round(S.length / R.length * 100) : 0,
             avg: max ? Math.round(g.reduce((a, s) => a + s.score, 0) / max * 100) : 0 };
  };
  const v = by('video'), q = by('quiz'), p = by('project');
  const early = ss.filter(s => { const r = rs.find(x => x.id === s.resourceId); return r && new Date(s.at) < new Date(r.deadline); }).length;
  const badges = [];
  if (q.done && q.avg >= 80) badges.push({ k: 'Quiz Ace', d: '80%+ average on quizzes' });
  if (early >= 2) badges.push({ k: 'Early Bird', d: 'Submits before deadlines' });
  if (rank && rank <= 3) badges.push({ k: 'Top 3', d: 'On the podium' });
  if (ss.length >= 3) badges.push({ k: 'Consistent', d: '3+ resources completed' });
  if (p.done) badges.push({ k: 'Builder', d: 'Shipped a project' });
  if (!badges.length) badges.push({ k: 'Rookie', d: 'Just getting started' });
  const weak = [['video', v], ['quiz', q], ['project', p]].sort((a, b) => a[1].pct - b[1].pct)[0];
  const tags = u.tags || [];
  return {
    name: u.name, tags, badges,
    stats: { done: ss.length, total: rs.length, rank, points: me.points || 0 },
    summary: `${u.name.split(' ')[0]} has completed ${ss.length} of ${rs.length} resources${rank ? ` and sits at #${rank} on the leaderboard` : ''}. ${q.done ? `Quiz average is ${q.avg}%. ` : ''}${tags.length ? `Interests: ${tags.join(', ')}.` : ''}`,
    recs: [`Finish the pending ${weak[0]}s next (${weak[1].pct}% done)`, ...tags.slice(0, 2).map(t => `Go deeper on ${t}: build a small project and share it with your mentor`)],
    skills: [{ k: 'Videos', v: v.pct }, { k: 'Quizzes', v: q.avg || q.pct }, { k: 'Projects', v: p.pct },
             { k: 'Punctual', v: ss.length ? Math.round(early / ss.length * 100) : 0 },
             { k: 'Rank', v: rank ? Math.max(10, 100 - (rank - 1) * 15) : 0 }],
  };
}

// Optional LLM enrichment (summary + recs). Cached until the mentee's data changes.
async function aiProfile(userId) {
  const base = ruleProfile(userId);
  if (!base) return null;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return base;

  const fingerprint = JSON.stringify([base.stats, base.tags, base.skills]);
  const cached = db.prepare('SELECT * FROM ai_cache WHERE user_id=?').get(userId);
  if (cached && cached.fingerprint === fingerprint) return { ...base, ...j(cached.payload, {}) };

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6', max_tokens: 500,
        system: 'You write short, encouraging progress profiles for students in a tech mentorship program. Respond ONLY with JSON: {"summary": string (max 60 words), "recs": string[] (exactly 3 concrete next steps)}.',
        messages: [{ role: 'user', content: JSON.stringify({ name: base.name, interests: base.tags, stats: base.stats, skills: base.skills, badges: base.badges }) }],
      }),
    });
    if (!res.ok) throw new Error(`LLM ${res.status}`);
    const data = await res.json();
    const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('').replace(/```json|```/g, '').trim();
    const out = JSON.parse(text);
    if (typeof out.summary !== 'string' || !Array.isArray(out.recs)) throw new Error('bad shape');
    const payload = { summary: out.summary, recs: out.recs.slice(0, 3).map(String) };
    db.prepare('INSERT OR REPLACE INTO ai_cache (user_id, fingerprint, payload) VALUES (?,?,?)').run(userId, fingerprint, JSON.stringify(payload));
    return { ...base, ...payload };
  } catch (e) {
    console.warn('AI profile fallback:', e.message);
    return base;
  }
}

module.exports = { leaderboard, ruleProfile, aiProfile };
