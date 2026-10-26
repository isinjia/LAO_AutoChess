@echo off
rem Export skinned meshes of the rigs listed in unity\proj\jobs.txt (python unity\setup.py <ids> writes it)
"C:\Program Files\Unity\Hubditor€0.0.58f2ditor\Unity.exe" -batchmode -nographics -quit -projectPath "%~dp0unity\proj" -executeMethod RefMesh.Run -logFile "%~dp0unity\mesh.log"
