"""Exercise browser-facing Node proxy + real Python inference in an isolated copy.

python scripts/smoke_model.py --node <node.exe> --image <example.jpg>
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def wait_url(url, process):
    for _ in range(200):
        if process.poll() is not None:
            raise RuntimeError(f'Server exited: {process.returncode}')
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                return json.load(response)
        except OSError:
            time.sleep(.1)
    raise TimeoutError(url)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--node', required=True)
    parser.add_argument('--image', type=Path, required=True)
    parser.add_argument('--model-dir', type=Path, help='Optional candidate to test instead of the active model')
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    web_port, ml_port = free_port(), free_port()
    while ml_port == web_port:
        ml_port = free_port()
    env = dict(os.environ, NO_OPEN='1', PORT=str(web_port), ML_PORT=str(ml_port), MODEL_DIR=str((args.model_dir or root / 'ml').resolve()))
    for key in ['GMAIL_USER', 'GMAIL_APP_PASSWORD', 'RESEND_API_KEY', 'MAIL_FROM', 'AUTH_SECRET']:
        env.pop(key, None)
    processes = []
    with tempfile.TemporaryDirectory(prefix='sirius-smoke-') as work:
        for name in ['server.js', 'package.json', 'index.html']:
            shutil.copy2(root / name, Path(work) / name)
        (Path(work) / '.env.local').write_text('GMAIL_USER=\nGMAIL_APP_PASSWORD=\nAUTH_SECRET=smoke-test-secret-only-not-for-production\n', encoding='utf-8')
        try:
            for cmd, cwd in [([sys.executable, str(root / 'ml' / 'infer_server.py')], root), ([args.node, 'server.js'], work)]:
                processes.append(subprocess.Popen(cmd, cwd=cwd, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
            health = wait_url(f'http://127.0.0.1:{ml_port}/health', processes[0])
            wait_url(f'http://127.0.0.1:{web_port}/api/health', processes[1])
            request = urllib.request.Request(f'http://127.0.0.1:{web_port}/api/analyze', data=args.image.read_bytes(), headers={'Content-Type': 'image/jpeg'}, method='POST')
            with urllib.request.urlopen(request, timeout=60) as response:
                result = json.load(response)
            assert len(result['probs']) == 4 and abs(sum(result['probs']) - 1) < 1e-6
            assert result['model'] == health['model']
            assert isinstance(result['regions'], list)
            print(json.dumps({'ok': True, 'model': result['model'], 'probs': result['probs'], 'regions': len(result['regions'])}, ensure_ascii=False))
        finally:
            for process in reversed(processes):
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()


if __name__ == '__main__':
    main()
