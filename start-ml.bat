@echo off
chcp 65001 >nul
cd /d "%~dp0ml"
set PYCMD=
if exist "%~dp0.venv\Scripts\python.exe" set PYCMD="%~dp0.venv\Scripts\python.exe"
if not defined PYCMD where py >nul 2>nul && set PYCMD=py -3
if not defined PYCMD where python >nul 2>nul && set PYCMD=python
if not defined PYCMD (
  echo Python 3.11 이상이 필요합니다. https://www.python.org/downloads/ 에서 설치한 뒤 다시 실행하세요.
  pause
  exit /b 1
)
%PYCMD% -c "import sklearn, skimage, PIL, joblib" >nul 2>nul
if errorlevel 1 (
  echo 필요한 패키지를 설치합니다...
  %PYCMD% -m pip install -r requirements.txt
  if errorlevel 1 (
    echo 설치에 실패했습니다. 위 메시지를 확인하세요.
    pause
    exit /b 1
  )
)
%PYCMD% infer_server.py
pause
