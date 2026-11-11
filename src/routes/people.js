const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { uid, genPassword, j, wrap, HttpError, toUser } = require('../util');

const mentors = require('express').Router();
const mentees = require('express').Router();
mentors.use(requireAuth); mentees.use(requireAuth);

const mentorOwns = (auth, programId) => {
  const m = db.prepare('SELECT program_ids FROM users WHERE id=?').get(auth.id);
  return j(m?.program_ids, []).includes(programId);
};

// ---- Mentors (admin only) ----
mentors.get('/', requireRole('admin'), wrap((_req, res) => {
  res.json(db.prepare("SELECT * FROM users WHERE role='mentor' ORDER BY name").all().map(toUser));
}));

// POST /api/mentors { name, email, programId } -> { user, login, password }
mentors.post('/', requireRole('admin'), wrap(async (req, res) => {
  const { name, email, programId } = req.body || {};
  if (!name || !email) throw new HttpError(400, 'name and email are required');
  if (db.prepare('SELECT 1 FROM users WHERE login=?').get(email)) throw new HttpError(409, 'A user with this email already exists');
  const prog = programId && db.prepare('SELECT id FROM programs WHERE id=?').get(programId);
  if (programId && !prog) throw new HttpError(404, 'Program not found');
  const id = uid(), password = genPassword();
  db.transaction(() => {
    db.prepare("INSERT INTO users (id,role,login,pw_hash,name,program_ids) VALUES (?,?,?,?,?,?)")
      .run(id, 'mentor', String(email).trim(), bcrypt.hashSync(password, 10), String(name).trim(), JSON.stringify(programId ? [programId] : []));
    if (programId) db.prepare('UPDATE programs SET mentor_id=? WHERE id=?').run(id, programId);
  })();
  res.status(201).json({ user: toUser(db.prepare('SELECT * FROM users WHERE id=?').get(id)), login: String(email).trim(), password });
}));

// ---- Mentees ----
mentees.get('/', requireRole('admin', 'mentor'), wrap((req, res) => {
  const pid = req.query.programId;
  if (req.auth.role === 'mentor' && (!pid || !mentorOwns(req.auth, pid))) throw new HttpError(403, 'Not your program');
  const rows = pid
    ? db.prepare("SELECT * FROM users WHERE role='mentee' AND program_id=? ORDER BY login").all(pid)
    : db.prepare("SELECT * FROM users WHERE role='mentee' ORDER BY login").all();
  res.json(rows.map(toUser));
}));

// POST /api/mentees { name, programId } -> { user, login, password }
mentees.post('/', requireRole('admin', 'mentor'), wrap((req, res) => {
  const { name, programId } = req.body || {};
  if (!name || !programId) throw new HttpError(400, 'name and programId are required');
  if (!db.prepare('SELECT 1 FROM programs WHERE id=?').get(programId)) throw new HttpError(404, 'Program not found');
  if (req.auth.role === 'mentor' && !mentorOwns(req.auth, programId)) throw new HttpError(403, 'Not your program');
  const seats = db.prepare('SELECT seats FROM programs WHERE id=?').get(programId).seats;
  const count = db.prepare("SELECT COUNT(*) c FROM users WHERE role='mentee' AND program_id=?").get(programId).c;
  if (count >= seats) throw new HttpError(409, 'Program is full');

  const year = new Date().getFullYear();
  let login, n = db.prepare("SELECT COUNT(*) c FROM users WHERE role='mentee'").get().c;
  do { n++; login = `TN${year}${String(n).padStart(3, '0')}`; } while (db.prepare('SELECT 1 FROM users WHERE login=?').get(login));
  const id = uid(), password = genPassword();
  db.prepare("INSERT INTO users (id,role,login,pw_hash,name,program_id,tags) VALUES (?,?,?,?,?,?,'[]')")
    .run(id, 'mentee', login, bcrypt.hashSync(password, 10), String(name).trim(), programId);
  res.status(201).json({ user: toUser(db.prepare('SELECT * FROM users WHERE id=?').get(id)), login, password });
}));

// PUT /api/mentees/:id { tags }
mentees.put('/:id', wrap((req, res) => {
  const row = db.prepare("SELECT * FROM users WHERE id=? AND role='mentee'").get(req.params.id);
  if (!row) throw new HttpError(404, 'Mentee not found');
  const { role, id } = req.auth;
  if (role === 'mentee' && id !== row.id) throw new HttpError(403, 'Not allowed');
  if (role === 'mentor' && !mentorOwns(req.auth, row.program_id)) throw new HttpError(403, 'Not your program');
  const tags = req.body?.tags;
  if (!Array.isArray(tags) || tags.length > 20) throw new HttpError(400, 'tags must be an array (max 20)');
  db.prepare('UPDATE users SET tags=? WHERE id=?').run(JSON.stringify(tags.map(t => String(t).trim()).filter(Boolean)), row.id);
  res.json({ ok: 1 });
}));

module.exports = { mentors, mentees };
