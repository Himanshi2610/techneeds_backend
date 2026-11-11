require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db');

function seed({ reset = false } = {}) {
  const D = 864e5, now = Date.now(), iso = x => new Date(now + x).toISOString();
  const h = p => bcrypt.hashSync(p, 10);
  db.transaction(() => {
    if (reset) db.exec('DELETE FROM ai_cache; DELETE FROM submissions; DELETE FROM resources; DELETE FROM users; DELETE FROM programs;');
    const P = db.prepare('INSERT INTO programs (id,name,desc,mentor_id,seats) VALUES (?,?,?,?,?)');
    P.run('p1', 'Web Development', 'Build modern web apps with industry best practices.', 'm1', 60);
    P.run('p2', 'DSA in C/C++', 'Master data structures and algorithms.', 'm1', 50);
    const U = db.prepare('INSERT INTO users (id,role,login,pw_hash,name,program_id,program_ids,tags) VALUES (?,?,?,?,?,?,?,?)');
    U.run('a1', 'admin', 'admin@techneeds.in', h('admin123'), 'TechNeeds Admin', null, null, '[]');
    U.run('m1', 'mentor', 'mentor@techneeds.in', h('mentor123'), 'Vidushi Agarwal', null, '["p1","p2"]', '[]');
    U.run('s1', 'mentee', 'TN2026001', h('tn@1234'), 'Aanya Sharma', 'p1', null, '["React","UI/UX"]');
    U.run('s2', 'mentee', 'TN2026002', h('tn@1234'), 'Riya Singh', 'p1', null, '["Node","DSA"]');
    U.run('s3', 'mentee', 'TN2026003', h('tn@1234'), 'Kriti Jain', 'p1', null, '["Python"]');
    const R = db.prepare('INSERT INTO resources (id,program_id,type,title,url,deadline,max_score) VALUES (?,?,?,?,?,?,?)');
    R.run('r1', 'p1', 'video', 'HTML & CSS Crash Course', 'https://youtube.com', iso(3 * D), 50);
    R.run('r2', 'p1', 'quiz', 'JavaScript Basics Quiz', 'https://forms.google.com', iso(5 * D), 100);
    R.run('r3', 'p1', 'project', 'Build a Portfolio Site', '', iso(10 * D), 200);
    R.run('r4', 'p1', 'video', 'Git & GitHub', 'https://youtube.com', iso(-D), 50);
    const S = db.prepare("INSERT INTO submissions (id,resource_id,user_id,link,at,status,score) VALUES (?,?,?,?,?,'graded',?)");
    [['r1', 's1', 50], ['r2', 's1', 92], ['r1', 's2', 50], ['r4', 's2', 50], ['r1', 's3', 50], ['r4', 's1', 50]]
      .forEach(([r, u, sc], i) => S.run('x' + i, r, u, '', iso(-2 * D), sc));
  })();
}

module.exports = { seed };
if (require.main === module) { seed({ reset: true }); console.log('Database reset and seeded.'); }
