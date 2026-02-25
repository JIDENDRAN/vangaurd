from django.shortcuts import render, redirect

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
