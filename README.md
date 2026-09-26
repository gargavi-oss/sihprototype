# RailOpt — Automatic Block Planning

Coordinated maintenance block planning for **Engineering (TMS)**, **Signal & Telecom (SMMS)** and
**Traction Distribution (TDMS)**, combined with the **Control Office** timetable and delay forecast.
A CPLEX optimiser picks block windows that disturb the fewest trains; SUMO simulates the result and a
Gemini agent proposes reroutes. Approved plans are published on a weekly / monthly calendar.

```
frontend (Next.js 16, :3000)  --/api/*-->  backend (Flask, :5050)
                                             ├─ instance/core.db  tms.db  smms.db  tdms.db  coa.db
                                             ├─ Solver/railway_maintenance_solver.py   (CPLEX MIP)
                                             ├─ sumo/spiderweb_network/scripts/*        (SUMO + TraCI)
                                             └─ backend/agent/ai_agent.py               (Gemini via LangChain)
```

## Logins (seeded on first start)
| Role | Username / password | Can do |
|---|---|---|
| Engineering · TMS | `tms` / `tms123` | Upload track block requests to `tms.db` |
| Signal & Telecom · SMMS | `smms` / `smms123` | Upload S&T block requests to `smms.db` |
| Traction · TDMS | `tdms` / `tdms123` | Upload traction block requests to `tdms.db` |
| Control Office · COA | `coa` / `coa123` | Upload timetable + delay forecast to `coa.db` |
| Block Planning Cell | `planner` / `planner123` | See all inputs, run optimiser, approve plans, SUMO, AI rerouting |

Departments see only their own requests plus approved plans. Change passwords before any real use.

## Flow
1. Each department signs in and uploads its CSV (or clicks **Use sample data**).
2. The Control Office uploads the timetable and delay forecast.
3. The planner opens **Block planning**, checks the inputs, picks a date and runs the optimiser → draft plan.
4. The planner reviews the plan (block timeline, trains inside blocks, slack to start-by slot),
   optionally runs SUMO / AI rerouting, then **Approves** it.
5. Approved plans appear on everyone's **Plan calendar** (week / month) and on each department's page.

Shortcut: the planner's **Load demo data** button fills all five sources with the demo CSVs.

## Live map (2D + 3D)
Sidebar → **Live map** (or **Live map** on a plan). Pick a plan and press play.
- **Simulated plans** replay the SUMO run: every train's recorded position, speed and signal holds,
  with each block lit in its department colour while SUMO had it active. If SUMO had to postpone a
  block because a train was still on the section, the panel shows both windows.
- **Not simulated yet** — shows timetable positions (with forecast delay) against the planned block
  windows; the planner can click **Run simulation** (headless SUMO, ~10 s) to record the real run.
- **3D** uses three.js: drag to orbit, scroll to zoom, right-drag to pan. Held trains show a red lamp.
- Track geometry comes from `sumo/spiderweb_network/network/network.net.xml` (`GET /network`);
  trajectories are stored per plan in `backend/instance/trajectories/plan_<id>.json`.

## CSV formats (unchanged from the prototype)
| Source | Columns |
|---|---|
| TMS / SMMS / TDMS requests | `track_id, section_id, block_duration, deadline, maintenance_type` |
| Timetable | `train_id, engine_type (D/E/H), category (1/2), t0 … t119` (cell = `R3_S5`) |
| Delay forecast | `train_id, delay` |

Uploads are validated (ranges, duplicates, max 9 trains). The planner's run rebuilds exactly these
CSVs from the department databases and feeds them to the existing pipeline, so solver input is the
same as uploading the files directly.

## Requirements
- Python 3.10+ and Node.js 20+
- A Gemini API key (only for AI rerouting)
- SUMO is installed automatically via the `eclipse-sumo` pip package

## Setup (Windows)
```bat
setup.bat          :: creates .venv, installs Python + npm packages, creates backend\.env
```
Then edit `backend\.env` and set `GEMINI_API_KEY`.

## Run
```bat
start.bat          :: opens two windows: API on :5050, frontend on :3000
```
Open http://localhost:3000 and sign in.

Manual equivalent:
```bat
.venv\Scripts\activate
cd backend && python app.py            :: terminal 1
cd frontend && npm run dev             :: terminal 2
```

## Test the pipeline without the UI
```bat
.venv\Scripts\activate
cd backend && python test_pipeline.py              :: parse CSVs -> CPLEX -> SUMO matrices
cd ..\sumo\spiderweb_network\scripts && python verify_output.py
```

## Configuration (`backend/.env`)
| Variable | Default | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | — | Gemini key for the AI agent |
| `GEMINI_MODEL` | `gemini-3.5-flash` | Gemini model name |
| `FLASK_PORT` | `5050` | API port (the frontend proxy in `next.config.mjs` expects 5050) |
| `FLASK_DEBUG` | `1` | Flask debug/reload |
| `SUMO_BINARY` | `sumo-gui` | `sumo` for headless simulation |

## API (all behind session login)
| Method | Path | Who |
|---|---|---|
| POST | `/auth/login`, `/auth/logout`; GET `/auth/me` | all |
| GET | `/dept/<tms\|smms\|tdms>/requests` | own dept, planner |
| POST | `/dept/<dept>/upload` (multipart `file`), `/dept/<dept>/sample`, `/dept/<dept>/withdraw` | own dept |
| GET | `/coa/data`; POST `/coa/upload/<timetable\|delay>`, `/coa/sample/<kind>` | COA (read: planner) |
| GET | `/planner/overview`; POST `/planner/solve` `{plan_date, title}`, `/planner/load_demo` | planner |
| GET | `/plans?from=&to=`, `/plans/<id>` | all (departments: approved only) |
| POST/PATCH/DELETE | `/plans/<id>/approve`, `/plans/<id>/reopen`, `/plans/<id>`, `/plans/<id>` | planner |
| POST | `/simulate` `{plan_id, headless}`; GET `/alternate_data?plan_id=&refresh=1` | planner |
| GET | `/network`, `/plans/<id>/trajectory` | all (departments: approved plans) |
| GET | `/templates/<blocks\|timetable\|delay>.csv` | public |

## Notes
- CPLEX Community Edition is limited to 1000 variables; `matrix_builder.py` compresses the problem and raises if exceeded.
- Data lives in five SQLite files under `backend/instance/` (one per department + `core.db`). The old `railopt.db` is no longer used. `docker-compose.yml` (Postgres) is not used.
- `ai_agent.py` in the project root is a legacy file (imports modules that don't exist); the live agent is `backend/agent/ai_agent.py`.
- `backend/static/` is the first plain-HTML UI; it is superseded by the Next.js app (its Solve button now needs a planner login).
- Time is measured in **slots** (0–119), the same unit the solver and SUMO use.
# sihprototype
