require('dotenv').config();
const db = require('./db');
const app = require('./app');

if (db.prepare('SELECT COUNT(*) c FROM users').get().c === 0) {
  console.log('Empty database — seeding demo data (run `npm run seed` to reset).');
  require('./seed').seed();
}
const port = process.env.PORT || 8000;
app.listen(port, () => console.log(`TechNeeds API listening on :${port}`));
