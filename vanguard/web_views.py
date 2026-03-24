from django.shortcuts import render
from django.contrib.auth.decorators import login_required

def index_view(request):
    return render(request, 'index.html')

def dashboard_view(request):
    return render(request, 'dashboard.html')

def vault_view(request):
    return render(request, 'vault.html')

def emergency_view(request):
    return render(request, 'emergency.html')

def audit_view(request):
    return render(request, 'audit.html')

def users_view(request):
    return render(request, 'users.html')

def settings_view(request):
    return render(request, 'settings.html')
