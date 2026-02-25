import os
import py_compile

def check_compilation(directory):
    for root, dirs, files in os.walk(directory):
        if '.git' in dirs:
            dirs.remove('.git')
        if '__pycache__' in dirs:
            dirs.remove('__pycache__')
        for file in files:
            if file.endswith('.py'):
                path = os.path.join(root, file)
                try:
                    py_compile.compile(path, doraise=True)
                except py_compile.PyCompileError as e:
                    print(f"Compilation error in: {path}")
                    print(e)
                except Exception as e:
                    print(f"Unexpected error in: {path}")
                    print(e)

if __name__ == "__main__":
    check_compilation('.')
