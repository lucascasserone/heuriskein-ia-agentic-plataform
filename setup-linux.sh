#!/bin/bash

# Heuriskein IA - Setup Automático Local (Mac/Linux)
# Execute com: bash ./setup-linux.sh

echo ""
echo "======================================"
echo "  Heuriskein IA - Setup Local"
echo "======================================"
echo ""

# 1. Verificar Python
echo "[1/4] Verificando Python..."
if ! command -v python3 &> /dev/null; then
    echo "✗ Python não encontrado!"
    echo "  Mac: brew install python3"
    echo "  Linux: sudo apt install python3"
    exit 1
fi
python3 --version

# 2. Setup Backend
echo ""
echo "[2/4] Configurando Backend Django..."
cd backend

# Criar venv
if [ ! -d "venv" ]; then
    echo "  Criando ambiente virtual..."
    python3 -m venv venv
fi

# Ativar venv
echo "  Ativando venv..."
source venv/bin/activate

# Instalar dependências
echo "  Instalando dependências..."
pip install -q -r requirements-dev.txt

# Migrations
echo "  Configurando banco de dados..."
python manage.py migrate > /dev/null 2>&1

# Criar superuser
echo "  Criando superusuário (admin/123456)..."
python manage.py shell <<EOF
from django.contrib.auth import get_user_model
User = get_user_model()
if not User.objects.filter(username='admin').exists():
    User.objects.create_superuser('admin', 'admin@localhost', '123456')
    print('SUCCESS')
else:
    print('EXISTS')
EOF

cd ..

# 3. Setup Frontend
echo ""
echo "[3/4] Configurando Frontend Next.js..."
cd frontend

# Verificar Node
if ! command -v node &> /dev/null; then
    echo "  ✗ Node.js não encontrado - pulando frontend"
    echo "    Instale em: https://nodejs.org"
else
    echo "  Instalando dependências..."
    npm install > /dev/null 2>&1
    
    # Criar .env.local
    echo "  Criando .env.local..."
    cat > .env.local <<EOF
NEXT_PUBLIC_API_URL=http://localhost:8001/api/v1
NEXT_PUBLIC_WS_URL=ws://localhost:8001/ws
EOF
    echo "  ✓ Configuração criada"
fi

cd ..

# 4. Instruções finais
echo ""
echo "[4/4] Setup Completo! ✓"

echo ""
echo "======================================"
echo "  PRÓXIMOS PASSOS"
echo "======================================"
echo ""

echo "1️⃣  BACKEND (terminal 1):"
echo "   cd backend"
echo "   source venv/bin/activate"
echo "   python manage.py runserver 0.0.0.0:8001"
echo ""

echo "2️⃣  FRONTEND (terminal 2):"
echo "   cd frontend"
echo "   npm run dev"
echo ""

echo "3️⃣  ACESSAR:"
echo "   Frontend: http://localhost:3000"
echo "   Backend: http://localhost:8001/api/v1/"
echo "   Admin: http://localhost:8001/admin (admin/123456)"
echo ""
