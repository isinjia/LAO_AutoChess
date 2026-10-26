@echo off
rem Bake the original effects listed in sdbuild\unity\proj\fx_jobs.txt (python tools\fxbuild\fx_setup.py writes it)
rem into sdbuild\unity\proj\fx\*.json; then python tools\fxbuild\build_fx.py
"C:\Program Files\Unity\Hub\Editor\6000.0.58f2\Editor\Unity.exe" -batchmode -projectPath "%~dp0..\sdbuild\unity\proj" -executeMethod RefFx.Run -logFile "%~dp0fx.log"
