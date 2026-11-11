# TechNeeds Backend

REST API for the [techneeds-frontend](https://github.com/code-withK/techneeds-frontend) app.
Node 18+ · Express · SQLite (better-sqlite3) · JWT auth · bcrypt password hashing.

## Run
    npm install
    cp .env.example .env      # set JWT_SECRET before deploying
    npm start                 # http://localhost:8000

On first start with an empty DB it seeds demo data (same as the frontend's offline demo).
Reset anytime with `npm run seed`.

Demo logins: `admin@techneeds.in / admin123` · `mentor@techneeds.in / mentor123` · `TN2026001 / tn@1234`

## Connect the frontend
In the frontend folder: `.env` -> `VITE_API_URL=http://localhost:8000`.
The paths in the frontend's `EP` map already match this API, so no frontend code changes are needed.
Set `CORS_ORIGIN` here to your frontend's origin(s) (comma-separated; default `http://localhost:5173`).

## Endpoints
All except login need `Authorization: Bearer <token>`.

| Method | Path | Who | Notes |
|---|---|---|---|
| POST | /api/auth/login | public | `{role,id,password}` -> `{token,user}` |
| GET | /api/programs | any | |
| POST | /api/programs | admin | `{name,desc,seats}` |
| GET | /api/mentors | admin | |
| POST | /api/mentors | admin | `{name,email,programId}` -> `{user,login,password}` |
| GET | /api/mentees?programId= | admin, mentor (own program) | |
| POST | /api/mentees | admin, mentor | `{name,programId}` -> `{user,login,password}` (auto enrollment no. `TN<year>NNN`) |
| PUT | /api/mentees/:id | self, mentor, admin | `{tags}` |
| GET | /api/resources?programId= | any (mentee: own program) | |
| POST | /api/resources | admin, mentor | `{programId,type,title,url,deadline,maxScore}` |
| GET | /api/submissions?userId=&programId= | scoped by role | |
| POST | /api/submissions | mentee | `{resourceId,link}`; user taken from token |
| POST | /api/submissions/grade | admin, mentor | `{id,score}` (0..maxScore) |
| GET | /api/leaderboard?programId= | any | |
| GET | /api/profile/ai/:id | self, mentor, admin | badges, stats, summary, recs, skills |
| GET | /health | public | |

## Behaviour notes
- **Videos** are auto-graded full marks on completion. **Quizzes** (external forms) and **projects** are `pending` until a mentor grades them.
- Submissions are blocked after the deadline and are one per mentee per resource.
- Generated passwords are shown once in the create response; only bcrypt hashes are stored.
- **AI profile**: rule-based by default. Set `ANTHROPIC_API_KEY` to have an LLM write the summary and recommendations server-side (cached until the mentee's data changes; falls back to rule-based on any error).

## Structure
    src/server.js    entry (seeds empty DB)      src/routes/auth.js      login
    src/app.js       express wiring, errors      src/routes/programs.js
    src/db.js        schema                      src/routes/people.js    mentors + mentees
    src/auth.js      JWT + role guards           src/routes/learning.js  resources, submissions, leaderboard, profile
    src/services.js  leaderboard + AI profile    src/seed.js             demo data
