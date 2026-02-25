import os

def fix_null_bytes(directory):
    for root, dirs, files in os.walk(directory):
        if '.git' in dirs: dirs.remove('.git')
        if '__pycache__' in dirs: dirs.remove('__pycache__')
        for file in files:
            if file.endswith('.py'):
                path = os.path.join(root, file)
                try:
                    with open(path, 'rb') as f:
                        content = f.read()
                    if b'\x00' in content:
                        print(f"Fixing {path}")
                        # Remove null bytes and try to decode/re-encode as utf-8
                        # If it was UTF-16, this might be more complex, but let's try simple removal first
                        new_content = content.replace(b'\x00', b'')
                        with open(path, 'wb') as f:
                            f.write(new_content)
                except Exception as e:
                    print(f"Error fixing {path}: {e}")

if __name__ == "__main__":
    fix_null_bytes('.')
