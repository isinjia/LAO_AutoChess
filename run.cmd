@echo off
cd /d "%~dp0"
start "" http://localhost:8770
python tools\serve.py 8770
