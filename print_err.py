import subprocess
try:
    subprocess.check_output(['python', 'manage.py', 'migrate'], stderr=subprocess.STDOUT)
except subprocess.CalledProcessError as e:
    err = e.output.decode('utf-8', errors='replace')
    print(err)
