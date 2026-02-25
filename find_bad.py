import os

def list_bad_files(directory):
    for root, dirs, files in os.walk(directory):
        if '.git' in dirs: dirs.remove('.git')
        if '__pycache__' in dirs: dirs.remove('__pycache__')
        for file in files:
            if file.endswith('.py'):
                path = os.path.join(root, file)
                try:
                    with open(path, 'rb') as f:
                        if b'\x00' in f.read():
                            print(f"BAD_FILE: {path}")
                except:
                    pass

if __name__ == "__main__":
    list_bad_files('.')
