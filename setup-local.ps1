#!/usr/bin/env powershell

# Heuriskein IA - Local Setup Script
# Windows PowerShell

Write-Host "=== Heuriskein IA - Local Setup ===" -ForegroundColor Cyan
Write-Host "Este script configura o projeto para rodar localmente" -ForegroundColor Gray
Write-Host ""

# Verificar Python
Write-Host "[1/5] Verificando Python..." -ForegroundColor Yellow
python --version 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Python não encontrado! Instale Python 3.11+" -ForegroundColor Red
    exit 1
}

# Verificar Node.js
Write-Host "[2/5] Verificando Node.js..." -ForegroundColor Yellow
node --version
npm --version

# Setup Backend
Write-Host "[3/5] Configurando Backend..." -ForegroundColor Yellow
cd backend

# Criar venv
if (-Not (Test-Path "venv")) {
    Write-Host "Criando virtual environment..." -ForegroundColor Green
    python -m venv venv
}

# Ativar venv
Write-Host "Ativando virtual environment..." -ForegroundColor Green
& ".\venv\Scripts\Activate.ps1"

# Instalar dependências
Write-Host "Instalando dependências Python..." -ForegroundColor Green
pip install -q -r requirements.txt

# Migrations
Write-Host "Rodando migrations..." -ForegroundColor Green
python manage.py migrate

# Create superuser
Write-Host "Criando superusuário (admin / 123456)..." -ForegroundColor Green
echo "from django.contrib.auth import get_user_model; User = get_user_model(); User.objects.create_superuser('admin', 'admin@localhost', '123456') if not User.objects.filter(username='admin').exists() else None" | python manage.py shell

# Setup Frontend
Write-Host "[4/5] Configurando Frontend..." -ForegroundColor Yellow
cd ..\frontend

Write-Host "Instalando dependências Node.js..." -ForegroundColor Green
npm install

# Create .env.local
Write-Host "Criando .env.local..." -ForegroundColor Green
@"
NEXT_PUBLIC_API_URL=http://localhost:8001/api/v1
NEXT_PUBLIC_WS_URL=ws://localhost:8001/ws
"@ | Out-File -Encoding utf8 -FilePath .env.local

Write-Host "[5/5] Setup Completo!" -ForegroundColor Green
Write-Host ""
Write-Host "=== PRÓXIMOS PASSOS ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Terminal 1 - Backend:" -ForegroundColor Green
Write-Host "  cd backend"
Write-Host "  venv\Scripts\activate"
Write-Host "  python manage.py runserver 0.0.0.0:8001"
Write-Host ""
Write-Host "Terminal 2 - Frontend:" -ForegroundColor Green
Write-Host "  cd frontend"
Write-Host "  npm run dev"
Write-Host ""
Write-Host "=== URLS ===" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:3000" -ForegroundColor White
Write-Host "Backend API: http://localhost:8001/api/v1/" -ForegroundColor White
Write-Host "Admin: http://localhost:8001/admin (admin / 123456)" -ForegroundColor White
Write-Host ""
