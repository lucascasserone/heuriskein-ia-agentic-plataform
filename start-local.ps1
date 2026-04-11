$ErrorActionPreference = 'Stop'

Set-Location $PSScriptRoot

Write-Host '[1/4] Limpando processos antigos...' -ForegroundColor Yellow
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process -Name python -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

Write-Host '[2/4] Subindo backend local...' -ForegroundColor Yellow
$py312 = Get-Command py -ErrorAction SilentlyContinue
if ($py312) {
  Start-Process -FilePath 'py' -ArgumentList '-3.12','c:/workspace/heuriskein-ia-agentic-plataform/backend/manage.py','runserver','127.0.0.1:8001','--noreload' -WorkingDirectory 'c:/workspace/heuriskein-ia-agentic-plataform' -WindowStyle Normal
} else {
  Start-Process -FilePath 'c:/workspace/heuriskein-ia-agentic-plataform/.venv/Scripts/python.exe' -ArgumentList 'c:/workspace/heuriskein-ia-agentic-plataform/backend/manage.py runserver 127.0.0.1:8001 --noreload' -WorkingDirectory 'c:/workspace/heuriskein-ia-agentic-plataform' -WindowStyle Normal
}

Write-Host '[3/4] Subindo frontend local...' -ForegroundColor Yellow
Start-Process -FilePath 'cmd.exe' -ArgumentList '/c','npm --prefix c:/workspace/heuriskein-ia-agentic-plataform/frontend run dev -- -p 3000' -WorkingDirectory 'c:/workspace/heuriskein-ia-agentic-plataform' -WindowStyle Normal

Write-Host '[4/4] Aguardando inicializacao...' -ForegroundColor Yellow
Start-Sleep -Seconds 5

try {
  $h = Invoke-WebRequest 'http://127.0.0.1:8001/api/v1/health/' -UseBasicParsing -TimeoutSec 6
  Write-Host "Backend: HTTP $($h.StatusCode)" -ForegroundColor Green
} catch {
  Write-Host "Backend nao respondeu ainda: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host 'Frontend: http://localhost:3000/dashboard' -ForegroundColor Green
