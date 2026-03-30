@echo off
REM Script para iniciar Backend Django
REM Certifique-se de estar no diretório raiz do projeto

cd backend
call venv\Scripts\activate.bat
python manage.py runserver 0.0.0.0:8001
