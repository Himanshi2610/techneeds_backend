const express = require('express');
const cors = require('cors');
const { mentors, mentees } = require('./routes/people');
const { resources, submissions, board, profile } = require('./routes/learning');

const app = express();
const origins = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(s => s.trim());
app.use(cors({ origin: origins.includes('*') ? true : origins }));
app.use(express.json({ limit: '100kb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/programs', require('./routes/programs'));
app.use('/api/mentors', mentors);
app.use('/api/mentees', mentees);
app.use('/api/resources', resources);
app.use('/api/submissions', submissions);
app.use('/api/leaderboard', board);
app.use('/api/profile', profile);

app.use((_req, res) => res.status(404).json({ message: 'Not found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ message: status === 500 ? 'Internal server error' : err.message });
});

module.exports = app;
