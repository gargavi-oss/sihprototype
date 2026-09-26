# RailOpt — project notes for Claude

See README.md for setup/run. Key facts:

- **Backend**: Flask in `backend/app.py` (port 5050). Session auth, 5 roles (tms, smms, tdms, coa, planner).
  Models in `backend/models.py`: one SQLite bind per department (`instance/{core,tms,smms,tdms,coa}.db`).
  Department CSV formats must stay identical — `write_pipeline_csvs()` rebuilds them for the pipeline.
  Pipeline dept key `tds` = TMS (Engineering). Pipeline code in `backend/agent/`
  (`csv_parser.py` → `matrix_builder.py` → `pipeline.py`). Paths resolve from `PROJECT_ROOT`
  in `pipeline.py`; subprocesses use `sys.executable`.
- **Solver**: `Solver/railway_maintenance_solver.py` reads `.npy` matrices from `solver_workspace/`,
  writes `X_result.npy`. CPLEX CE limit: 1000 variables.
- **SUMO**: `sumo/spiderweb_network/`. Follow `sumo/.agents/rules/sumo_simulation_rules.md`
  (single platform, 2-block headway, never `traci.vehicle.setStop`). Validate with `verify_output.py`.
- **Frontend**: Next.js 16 + React 19 + Tailwind 4 in `frontend/`. Read `frontend/AGENTS.md` —
  this Next.js version has breaking changes; check `node_modules/next/dist/docs/` before writing code.
  All API calls go through `/api/*` (rewritten to :5050 in `next.config.mjs`) via `src/lib/api.js`; use `useApi()`
  for page data (avoids the set-state-in-effect lint rule). Design tokens in `src/app/globals.css`
  (plain institutional: paper bg, ink text, railway-red accent, dept colours only for tags/bars). Icons: lucide-react.
  Routes: `/login`, `/planner`, `/plans`, `/plans/[id]`, `/plans/[id]/reroute`, `/requests/[dept]`, `/control-office`, `/map`.
  Live map: `src/lib/mapModel.js` (interpolation/state), `components/map/Map2D.js` (SVG), `Map3D.js` (three.js r186,
  `three/addons/...`). `run_simulation.py` writes `output/trajectory.json` (observation only — never change signalling for it).
- **AI agent**: `backend/agent/ai_agent.py`, Gemini via `langchain-google-genai`, key in `backend/.env`.
- Root `ai_agent.py` is legacy/dead code.
- Test: `cd backend && python test_pipeline.py` must end with `PASS`.
- Known issue (not yet fixed): `matrix_builder.py` encodes engines D=0,H=1,E=2 but the solver treats index 1 as Electric.
