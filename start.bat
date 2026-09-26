@echo off
REM Starts the Flask API (port 5050) and the Next.js frontend (port 3000).
cd /d "%~dp0"
start "RailOpt API" cmd /k "call .venv\Scripts\activate.bat && cd backend && python app.py"
start "RailOpt Frontend" cmd /k "cd frontend && npm run dev"
echo API:      http://localhost:5050
echo Frontend: http://localhost:3000
