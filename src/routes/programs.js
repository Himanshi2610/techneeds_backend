const router = require('express').Router();
const db = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { uid, wrap, HttpError, toProgram } = require('../util');

router.use(requireAuth);

router.get('/', wrap((_req, res) => {
  res.json(db.prepare('SELECT * FROM programs ORDER BY name').all().map(toProgram));
}));

router.post('/', requireRole('admin'), wrap((req, res) => {
  const { name, desc = '', seats = 50 } = req.body || {};
  if (!name || !String(name).trim()) throw new HttpError(400, 'name is required');
  const id = uid();
  db.prepare('INSERT INTO programs (id,name,desc,seats) VALUES (?,?,?,?)').run(id, String(name).trim(), String(desc), Number(seats) || 50);
  res.status(201).json(toProgram(db.prepare('SELECT * FROM programs WHERE id=?').get(id)));
}));

module.exports = router;
