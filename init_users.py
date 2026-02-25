import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from vanguard.models import User

def init_db():
    if not User.objects.filter(username='admin').exists():
        User.objects.create_superuser('admin', 'admin@example.com', 'admin123', role='admin')
        print("Superuser 'admin' created with password 'admin123'")
    else:
        print("Superuser 'admin' already exists")

    if not User.objects.filter(username='compliance').exists():
        User.objects.create_user('compliance', 'comp@example.com', 'comp123', role='compliance')
        print("Compliance Officer 'compliance' created with password 'comp123'")

if __name__ == '__main__':
    init_db()
