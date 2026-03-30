@echo off
REM Frontend Quick Test
REM Test if frontend is responding on port 8080

echo Testing frontend on http://localhost:8080...
echo.

REM Using PowerShell to test
powershell -Command "try { $resp = Invoke-WebRequest -Uri 'http://localhost:8080' -TimeoutSec 5 -UseBasicParsing; if ($resp.StatusCode -eq 200) { Write-Host 'Frontend RESPONDING (HTTP 200)' -ForegroundColor Green } else { Write-Host \"HTTP $($resp.StatusCode)\" } } catch { Write-Host 'Frontend NOT responding (still compiling or not started)' -ForegroundColor Red }"

pause
