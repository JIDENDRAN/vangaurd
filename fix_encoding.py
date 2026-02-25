import os

def convert_to_utf8(file_path):
    try:
        with open(file_path, 'rb') as f:
            content = f.read()
        
        # Check for UTF-16 BOMs
        if content.startswith(b'\xff\xfe'):
            print(f"Converting UTF-16 LE: {file_path}")
            decoded = content.decode('utf-16')
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(decoded)
        elif content.startswith(b'\xfe\xff'):
            print(f"Converting UTF-16 BE: {file_path}")
            decoded = content.decode('utf-16-be')
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(decoded)
        elif b'\x00' in content:
            # If there are null bytes but no BOM, it might be UTF-16 without BOM or just corrupted UTF-8
            # Since we already ran a "remove nulls" script, we might have corrupted it.
            # Let's try to see if it's readable.
            print(f"Null bytes found in (no BOM): {file_path}")
            # Try to decode as utf-8 after stripping nulls
            new_content = content.replace(b'\x00', b'')
            try:
                new_content.decode('utf-8')
                with open(file_path, 'wb') as f:
                    f.write(new_content)
                print(f"Fixed by stripping nulls: {file_path}")
            except:
                print(f"Could not fix {file_path} easily.")
    except Exception as e:
        print(f"Error processing {file_path}: {e}")

def walk_and_fix(directory):
    for root, dirs, files in os.walk(directory):
        if '.git' in dirs: dirs.remove('.git')
        if '__pycache__' in dirs: dirs.remove('__pycache__')
        for file in files:
            if file.endswith('.py') or file.endswith('.txt') or file.endswith('.md'):
                path = os.path.join(root, file)
                convert_to_utf8(path)

if __name__ == "__main__":
    walk_and_fix('.')
