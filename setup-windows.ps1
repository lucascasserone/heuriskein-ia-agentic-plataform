# Heuriskein IA - Setup Automático Local (Windows)
# Execute com: powershell -ExecutionPolicy Bypass -File .\setup-local.ps1

param(
    [switch]$SkipNode = $false
)

Write-Host "`n======================================" -ForegroundColor Cyan
Write-Host "  Heuriskein IA - Setup Local" -ForegroundColor Cyan
Write-Host "======================================`n" -ForegroundColor Cyan

# 1. Verificar Python
Write-Host "[1/4] Verificando Python..." -ForegroundColor Yellow
$pythonCheck = python --version 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ $pythonCheck" -ForegroundColor Green
} else {
    Write-Host "✗ Python não encontrado!" -ForegroundColor Red
    Write-Host "  Baixe em: https://www.python.org/downloads" -ForegroundColor Gray
    exit 1
}

# 2. Setup Backend
Write-Host "`n[2/4] Configurando Backend Django..." -ForegroundColor Yellow
Push-Location backend

# Criar venv
if (-not (Test-Path "venv")) {
    Write-Host "  Criando ambiente virtual..." -ForegroundColor Green
    python -m venv venv
}

# Ativar venv
Write-Host "  Ativando venv..." -ForegroundColor Green
& ".\venv\Scripts\Activate.ps1"

# Instalar dependências
Write-Host "  Instalando dependências..." -ForegroundColor Green
pip install -q -r requirements-dev.txt 2>&1 | Out-Null

# Migrations
Write-Host "  Configurando banco de dados..." -ForegroundColor Green
python manage.py migrate 2>&1 | Out-Null

# Criar superuser
Write-Host "  Criando superusuário (admin/123456)..." -ForegroundColor Green
$script = @"
from django.contrib.auth import get_user_model
User = get_user_model()
if not User.objects.filter(username='admin').exists():
    User.objects.create_superuser('admin', 'admin@localhost', '123456')
    print('SUCCESS')
else:
    print('EXISTS')
"@
$result = echo $script | python manage.py shell 2>&1
if ($result -match "SUCCESS") {
    Write-Host "  ✓ Superusuário criado" -ForegroundColor Green
} elseif ($result -match "EXISTS") {
    Write-Host "  ✓ Superusuário já existe" -ForegroundColor Green
}

Pop-Location

# 3. Setup Frontend
if (-not $SkipNode) {
    Write-Host "`n[3/4] Configurando Frontend Next.js..." -ForegroundColor Yellow
    Push-Location frontend

    # Verificar Node
    $nodeCheck = node --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  $nodeCheck instalado" -ForegroundColor Green
        
        Write-Host "  Instalando dependências..." -ForegroundColor Green
        npm install 2>&1 | Out-Null
        
        # Criar .env.local
        Write-Host "  Criando .env.local..." -ForegroundColor Green
        $envContent = @"
NEXT_PUBLIC_API_URL=http://localhost:8001/api/v1
NEXT_PUBLIC_WS_URL=ws://localhost:8001/ws
"@
        $envContent | Out-File -Encoding utf8 -FilePath .env.local
        Write-Host "  ✓ Configuração criada" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Node.js não encontrado - pulando frontend" -ForegroundColor Yellow
        Write-Host "    Baixe em: https://nodejs.org" -ForegroundColor Gray
    }
    
    Pop-Location
} else {
    Write-Host "`n[3/4] Pulando setup do Node (use -SkipNode)" -ForegroundColor Yellow
}

# 4. Instruções finais
Write-Host "`n[4/4] Setup Completo! ✓" -ForegroundColor Green

Write-Host "`n======================================" -ForegroundColor Cyan
Write-Host "  PRÓXIMOS PASSOS" -ForegroundColor Cyan
Write-Host "======================================`n" -ForegroundColor Cyan

Write-Host "1️⃣  BACKEND (abra um novo PowerShell):" -ForegroundColor Green
Write-Host "   cd backend" -ForegroundColor White
Write-Host "   .\venv\Scripts\activate" -ForegroundColor White
Write-Host "   python manage.py runserver 0.0.0.0:8001" -ForegroundColor White

Write-Host "`n2️⃣  FRONTEND (abra outro PowerShell):" -ForegroundColor Green
Write-Host "   cd frontend" -ForegroundColor White
Write-Host "   npm run dev" -ForegroundColor White

Write-Host "`n3️⃣  ACESSAR:" -ForegroundColor Green
Write-Host "   Frontend: http://localhost:3000" -ForegroundColor Cyan
Write-Host "   Backend: http://localhost:8001/api/v1/" -ForegroundColor Cyan
Write-Host "   Admin: http://localhost:8001/admin (admin/123456)" -ForegroundColor Cyan

Write-Host "`n======================================" -ForegroundColor Cyan
Write-Host "  Documentação" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  📖 QUICKSTART.md - Guia rápido" -ForegroundColor Gray
Write-Host "  📖 LOCAL_SETUP.md - Setup detalhado" -ForegroundColor Gray
Write-Host "  📖 README.md - Visão geral" -ForegroundColor Gray

Write-Host "`n"
