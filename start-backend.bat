@echo off
REM Script para iniciar Backend Django
REM Certifique-se de estar no diretório raiz do projeto

cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
	py -3.12 -c "import django" >nul 2>nul
	if %errorlevel%==0 (
		py -3.12 backend\manage.py runserver 0.0.0.0:8001
		goto :eof
	)
)

if exist ".venv\Scripts\python.exe" (
	.venv\Scripts\python.exe backend\manage.py runserver 0.0.0.0:8001
	goto :eof
)

if exist "backend\venv\Scripts\python.exe" (
	backend\venv\Scripts\python.exe backend\manage.py runserver 0.0.0.0:8001
	goto :eof
)

echo [ERRO] Nenhum ambiente virtual encontrado.
echo Crie .venv na raiz ou backend\venv e instale as dependencias.
exit /b 1
