import subprocess, time, sys, os

# Step 1: Kill whatever is on port 8000
for _ in range(3):
    r = subprocess.run(
        ['powershell', '-Command',
         'Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess'],
        capture_output=True, text=True, errors='replace'
    )
    for line in r.stdout.strip().splitlines():
        pid = line.strip()
        if pid.isdigit() and int(pid) > 4:
            subprocess.run(
                ['powershell', '-Command', f'Stop-Process -Id {pid} -Force -ErrorAction SilentlyContinue'],
                capture_output=True
            )
            print(f'[kill] PID {pid}')
    time.sleep(1)

# Step 2: Verify
r = subprocess.run(
    ['powershell', '-Command',
     'Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Select-Object OwningProcess,State'],
    capture_output=True, text=True, errors='replace'
)
print('Port 8000 sonrasi:', r.stdout.strip() or '(temiz)')
