const db = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { leaderboard, aiProfile } = require('../services');
const { uid, j, wrap, HttpError, toResource, toSubmission } = require('../util');

const resources = require('express').Router();
const submissions = require('express').Router();
const board = require('express').Router();
const profile = require('express').Router();
[resources, submissions, board, profile].forEach(r => r.use(requireAuth));

const me = auth => db.prepare('SELECT * FROM users WHERE id=?').get(auth.id);
const mentorOwns = (auth, pid) => j(me(auth)?.program_ids, []).includes(pid);
// Throws unless the caller may see/manage this program
function canAccessProgram(auth, pid, { write = false } = {}) {
  if (auth.role === 'admin') return;
  if (auth.role === 'mentor' && mentorOwns(auth, pid)) return;
  if (auth.role === 'mentee' && !write && me(auth)?.program_id === pid) return;
  throw new HttpError(403, 'Not allowed for this program');
}

// ---- Resources ----
resources.get('/', wrap((req, res) => {
  let pid = req.query.programId;
  if (req.auth.role === 'mentee') pid = me(req.auth).program_id;
  if (!pid) throw new HttpError(400, 'programId is required');
  canAccessProgram(req.auth, pid);
  res.json(db.prepare('SELECT * FROM resources WHERE program_id=? ORDER BY deadline').all(pid).map(toResource));
}));

resources.post('/', requireRole('admin', 'mentor'), wrap((req, res) => {
  const { programId, type, title, url = '', deadline, maxScore = 50 } = req.body || {};
  if (!programId || !title || !deadline) throw new HttpError(400, 'programId, title and deadline are required');
  if (!['video', 'quiz', 'project'].includes(type)) throw new HttpError(400, 'type must be video, quiz or project');
  if (Number.isNaN(Date.parse(deadline))) throw new HttpError(400, 'deadline must be a valid date');
  if (!(Number(maxScore) > 0)) throw new HttpError(400, 'maxScore must be positive');
  if (!db.prepare('SELECT 1 FROM programs WHERE id=?').get(programId)) throw new HttpError(404, 'Program not found');
  canAccessProgram(req.auth, programId, { write: true });
  const id = uid();
  db.prepare('INSERT INTO resources (id,program_id,type,title,url,deadline,max_score) VALUES (?,?,?,?,?,?,?)')
    .run(id, programId, type, String(title).trim(), String(url), new Date(deadline).toISOString(), Math.round(Number(maxScore)));
  res.status(201).json(toResource(db.prepare('SELECT * FROM resources WHERE id=?').get(id)));
}));

// ---- Submissions ----
submissions.get('/', wrap((req, res) => {
  const { role } = req.auth;
  let { userId, programId } = req.query;
  if (role === 'mentee') { userId = req.auth.id; programId = undefined; }
  else if (role === 'mentor') {
    if (programId) canAccessProgram(req.auth, programId);
    else if (userId) {
      const u = db.prepare('SELECT program_id FROM users WHERE id=?').get(userId);
      if (!u) throw new HttpError(404, 'User not found');
      canAccessProgram(req.auth, u.program_id);
    } else throw new HttpError(400, 'programId or userId is required');
  }
  const where = [], args = [];
  if (userId) { where.push('s.user_id=?'); args.push(userId); }
  if (programId) { where.push('r.program_id=?'); args.push(programId); }
  const rows = db.prepare(`SELECT s.* FROM submissions s JOIN resources r ON r.id=s.resource_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY s.at DESC`).all(...args);
  res.json(rows.map(toSubmission));
}));

// POST /api/submissions { resourceId, link }  (mentee only; userId always taken from the token)
submissions.post('/', requireRole('mentee'), wrap((req, res) => {
  const { resourceId, link = '' } = req.body || {};
  const r = db.prepare('SELECT * FROM resources WHERE id=?').get(resourceId);
  if (!r) throw new HttpError(404, 'Resource not found');
  if (r.program_id !== me(req.auth).program_id) throw new HttpError(403, 'Not in your program');
  if (new Date(r.deadline) < new Date()) throw new HttpError(400, 'Deadline has passed');
  if (db.prepare('SELECT 1 FROM submissions WHERE resource_id=? AND user_id=?').get(r.id, req.auth.id)) throw new HttpError(409, 'Already submitted');
  if (r.type === 'project' && !String(link).trim()) throw new HttpError(400, 'A project link is required');
  // Videos are completion-based and auto-graded. Quizzes (external forms) and projects wait for mentor grading.
  const auto = r.type === 'video';
  const id = uid();
  db.prepare('INSERT INTO submissions (id,resource_id,user_id,link,at,status,score) VALUES (?,?,?,?,?,?,?)')
    .run(id, r.id, req.auth.id, String(link), new Date().toISOString(), auto ? 'graded' : 'pending', auto ? r.max_score : 0);
  res.status(201).json(toSubmission(db.prepare('SELECT * FROM submissions WHERE id=?').get(id)));
}));

// POST /api/submissions/grade { id, score }
submissions.post('/grade', requireRole('admin', 'mentor'), wrap((req, res) => {
  const { id, score } = req.body || {};
  const s = db.prepare('SELECT s.*, r.max_score, r.program_id FROM submissions s JOIN resources r ON r.id=s.resource_id WHERE s.id=?').get(id);
  if (!s) throw new HttpError(404, 'Submission not found');
  canAccessProgram(req.auth, s.program_id, { write: true });
  const n = Number(score);
  if (score === '' || score == null || !Number.isFinite(n) || n < 0 || n > s.max_score) throw new HttpError(400, `score must be between 0 and ${s.max_score}`);
  db.prepare("UPDATE submissions SET score=?, status='graded' WHERE id=?").run(Math.round(n), id);
  res.json(toSubmission(db.prepare('SELECT * FROM submissions WHERE id=?').get(id)));
}));

// ---- Leaderboard ----
board.get('/', wrap((req, res) => {
  let pid = req.query.programId;
  if (req.auth.role === 'mentee') pid = me(req.auth).program_id;
  else if (req.auth.role === 'mentor' && pid) canAccessProgram(req.auth, pid);
  else if (req.auth.role === 'mentor') throw new HttpError(400, 'programId is required');
  res.json(leaderboard(pid));
}));

// ---- AI profile ----
profile.get('/ai/:id', wrap(async (req, res) => {
  const u = db.prepare("SELECT * FROM users WHERE id=? AND role='mentee'").get(req.params.id);
  if (!u) throw new HttpError(404, 'Mentee not found');
  if (req.auth.role === 'mentee' && req.auth.id !== u.id) throw new HttpError(403, 'Not allowed');
  if (req.auth.role === 'mentor') canAccessProgram(req.auth, u.program_id);
  res.json(await aiProfile(u.id));
}));

module.exports = { resources, submissions, board, profile };
