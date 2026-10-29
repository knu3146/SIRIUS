@echo off
chcp 65001 >nul
cd /d "%~dp0ml"
set PYCMD=
if exist "%~dp0.venv\Scripts\python.exe" set PYCMD="%~dp0.venv\Scripts\python.exe"
if not defined PYCMD (
  where py >nul 2>nul
  if not errorlevel 1 set PYCMD=py -3
)
if not defined PYCMD (
  where python >nul 2>nul
  if not errorlevel 1 set PYCMD=python
)
if not defined PYCMD (
  echo Python 3.11 이상이 필요합니다. https://www.python.org/downloads/ 에서 설치한 뒤 다시 실행하세요.
  pause
  exit /b 1
)
%PYCMD% -c "import sklearn, skimage, PIL, joblib; assert sklearn.__version__ == '1.9.1'" >nul 2>nul
if errorlevel 1 (
  echo 필요한 패키지를 설치합니다...
  %PYCMD% -m pip install -r requirements.txt
  if errorlevel 1 (
    echo 설치에 실패했습니다. 위 메시지를 확인하세요.
    pause
    exit /b 1
  )
)
%PYCMD% -c "import json, os, sys; p=os.path.join(os.environ.get('MODEL_DIR','.'),'model_meta.json'); m=json.load(open(p,encoding='utf-8')); sys.exit(0 if m.get('architecture') in ('mobilenet_v3_small','mobilenet_v3_small_finetuned','efficientnet_b0') else 1)" >nul 2>nul
if not errorlevel 1 (
  %PYCMD% -c "import torch, torchvision; assert torch.__version__.split('+')[0] == '2.15.0'; assert torchvision.__version__.split('+')[0] == '0.29.2'" >nul 2>nul
  if errorlevel 1 (
    echo CNN 분석용 CPU 패키지를 설치합니다...
    %PYCMD% -m pip install torch==2.15.0 torchvision==0.29.2 --index-url https://download.pytorch.org/whl/cpu
    if errorlevel 1 (
      echo CNN 패키지 설치에 실패했습니다.
      pause
      exit /b 1
    )
  )
)
%PYCMD% infer_server.py
pause
