const jwt = require('jsonwebtoken');
const { HttpError } = require('./util');
const secret = () => process.env.JWT_SECRET || 'dev-secret-change-me';

const sign = user => jwt.sign({ sub: user.id, role: user.role }, secret(), { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

function requireAuth(req, _res, next) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!t) return next(new HttpError(401, 'Authentication required'));
  try { const p = jwt.verify(t, secret()); req.auth = { id: p.sub, role: p.role }; next(); }
  catch { next(new HttpError(401, 'Invalid or expired token')); }
}
const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.auth.role) ? next() : next(new HttpError(403, 'Not allowed'));

module.exports = { sign, requireAuth, requireRole };
