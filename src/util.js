const crypto = require('crypto');
const uid = () => crypto.randomBytes(4).toString('hex');
const genPassword = () => crypto.randomBytes(6).toString('base64url').slice(0, 10);
const j = (s, d) => { try { return JSON.parse(s) ?? d; } catch { return d; } };
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

// DB row -> shape the frontend expects
const toUser = r => r && ({
  id: r.id, role: r.role, login: r.login, name: r.name,
  ...(r.role === 'mentee' ? { programId: r.program_id, tags: j(r.tags, []) } : {}),
  ...(r.role === 'mentor' ? { programIds: j(r.program_ids, []) } : {}),
});
const toProgram = r => ({ id: r.id, name: r.name, desc: r.desc, mentorId: r.mentor_id, seats: r.seats });
const toResource = r => ({ id: r.id, programId: r.program_id, type: r.type, title: r.title, url: r.url, deadline: r.deadline, maxScore: r.max_score });
const toSubmission = r => ({ id: r.id, resourceId: r.resource_id, userId: r.user_id, link: r.link, at: r.at, status: r.status, score: r.score });

module.exports = { uid, genPassword, j, wrap, HttpError, toUser, toProgram, toResource, toSubmission };
