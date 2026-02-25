import os

files = ['manage.py', 'core/settings.py', 'vanguard/management/__init__.py', 'vanguard/management/commands/__init__.py']
for f in files:
    if os.path.exists(f):
        with open(f, 'rb') as fd:
            print(f"{f}: {fd.read(10)}")
    else:
        print(f"{f}: NOT FOUND")
