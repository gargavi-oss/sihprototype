@echo off
REM One-time setup for RailOpt (Windows). Run from the project folder.
cd /d "%~dp0"

echo [1/3] Creating Python virtual environment...
if not exist .venv python -m venv .venv || goto :error
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r backend\requirements.txt || goto :error

echo [2/3] Installing frontend packages...
pushd frontend
call npm install || (popd & goto :error)
popd

echo [3/3] Checking backend\.env ...
if not exist backend\.env copy backend\.env.example backend\.env
echo.
echo Setup complete. Put your GEMINI_API_KEY in backend\.env, then run start.bat
goto :eof

:error
echo Setup failed. See the messages above.
exit /b 1
