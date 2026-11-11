const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { sign } = require('../auth');
const { wrap, HttpError, toUser } = require('../util');

// POST /api/auth/login  { role, id, password }
router.post('/login', wrap(async (req, res) => {
  const { role, id, password } = req.body || {};
  if (!role || !id || !password) throw new HttpError(400, 'role, id and password are required');
  const row = db.prepare('SELECT * FROM users WHERE role=? AND login=?').get(role, String(id).trim());
  // compare even when missing to keep timing similar
  const ok = await bcrypt.compare(String(password), row ? row.pw_hash : '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali');
  if (!row || !ok) throw new HttpError(401, 'Invalid credentials');
  res.json({ token: sign(row), user: toUser(row) });
}));

module.exports = router;
