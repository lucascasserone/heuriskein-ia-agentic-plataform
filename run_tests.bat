@echo off
setlocal enabledelayedexpansion

REM Get the project root directory
cd /d "%~dp0"

REM Run the tests using python from venv
.venv\Scripts\python.exe test_features.py

pause
