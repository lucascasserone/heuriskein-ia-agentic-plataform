#!/usr/bin/env python3
"""
Frontend Testing Script - Heuriskein IA
Tests: Page Load, Components, Login Flow, Backend Integration
"""

import requests
import json
import time
from datetime import datetime
from html.parser import HTMLParser

FRONTEND_URL = "http://localhost:3003"
BACKEND_URL = "http://localhost:8001/api/v1"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    END = '\033[0m'

def log_section(title):
    print(f"\n{Colors.BLUE}{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}{Colors.END}\n")

def log_test(name, status, message=""):
    status_str = f"{Colors.GREEN}✓ PASS{Colors.END}" if status else f"{Colors.RED}✗ FAIL{Colors.END}"
    print(f"[{status_str}] {name}")
    if message:
        print(f"     {Colors.YELLOW}→ {message}{Colors.END}")

def test_frontend_server():
    """Test 1: Frontend server is responding"""
    log_section("TEST 1: Frontend Server Response")
    
    try:
        response = requests.get(f"{FRONTEND_URL}/", timeout=5)
        success = response.status_code == 200
        log_test("Frontend server is responding", success, f"HTTP {response.status_code}")
        
        if success:
            # Check for basic HTML structure
            html_content = response.text
            has_html = "<html" in html_content.lower() or "<!doctype" in html_content.lower()
            has_body = "<body" in html_content.lower()
            
            print(f"     HTML Structure: {Colors.GREEN if has_html else Colors.RED}{'✓' if has_html else '✗'}{Colors.END}")
            print(f"     Body Tag: {Colors.GREEN if has_body else Colors.RED}{'✓' if has_body else '✗'}{Colors.END}")
        else:
            print(f"     Content (first 200 chars): {response.text[:200]}")
        
        return success
        
    except requests.exceptions.ConnectionError:
        log_test("Frontend server", False, f"Cannot connect to {FRONTEND_URL}")
        return False
    except Exception as e:
        log_test("Frontend server", False, str(e))
        return False

def test_page_elements():
    """Test 2: Check for key page elements"""
    log_section("TEST 2: Page Elements & Components")
    
    try:
        response = requests.get(f"{FRONTEND_URL}/", timeout=5)
        html = response.text.lower()
        
        elements = {
            "Navigation/Header": ["header", "nav", "<nav"],
            "Main Content Area": ["main", "<main"],
            "Footer": ["footer", "<footer"],
            "React App": ["root", "react", "__next"],
            "Tailwind CSS": ["class=[\"']"],
            "Authentication": ["login", "register", "auth"]
        }
        
        found_count = 0
        for element_name, keywords in elements.items():
            found = any(kw in html for kw in keywords)
            log_test(f"  {element_name}", found)
            if found:
                found_count += 1
        
        print(f"\n     Found: {Colors.CYAN}{found_count}/{len(elements)} element groups{Colors.END}")
        return found_count > 0
        
    except Exception as e:
        log_test("Page elements", False, str(e))
        return False

def test_static_assets():
    """Test 3: Check for static assets loading"""
    log_section("TEST 3: Static Assets Loading")
    
    try:
        response = requests.get(f"{FRONTEND_URL}/", timeout=5)
        html = response.text
        
        assets = {
            "_next bundle": "_next" in html,
            "CSS files": ".css" in html or "<style" in html,
            "JavaScript": ".js" in html or "<script" in html,
            "Meta tags": "<meta" in html,
        }
        
        success_count = sum(1 for v in assets.values() if v)
        
        for asset_name, found in assets.items():
            log_test(f"  {asset_name}", found)
        
        print(f"\n     Loaded: {Colors.CYAN}{success_count}/{len(assets)} asset types{Colors.END}")
        return success_count > 2
        
    except Exception as e:
        log_test("Static assets", False, str(e))
        return False

def test_api_integration():
    """Test 4: Frontend can reach backend"""
    log_section("TEST 4: Backend Integration")
    
    try:
        # Test if frontend config is correct
        response = requests.get(f"{FRONTEND_URL}/", timeout=5)
        frontend_ok = response.status_code == 200
        log_test("Frontend accessible", frontend_ok)
        
        # Test backend connection
        backend_response = requests.get(f"{BACKEND_URL}/health/", timeout=5)
        backend_ok = backend_response.status_code == 200
        log_test("Backend API accessible", backend_ok, f"HTTP {backend_response.status_code}")
        
        if backend_ok:
            data = backend_response.json()
            print(f"     Backend status: {Colors.GREEN}{data.get('status', 'unknown')}{Colors.END}")
        
        return frontend_ok and backend_ok
        
    except Exception as e:
        log_test("Backend integration", False, str(e))
        return False

def test_auth_endpoints():
    """Test 5: Authentication endpoints availability"""
    log_section("TEST 5: Authentication Endpoints")
    
    try:
        # Test register endpoint
        reg_response = requests.post(
            f"{BACKEND_URL}/auth/register/",
            json={"test": "endpoint_check"},
            timeout=5
        )
        register_ok = reg_response.status_code in [400, 405]  # Wrong data = 400, no POST = 405
        log_test("Register endpoint exists", register_ok, f"HTTP {reg_response.status_code}")
        
        # Test login endpoint
        login_response = requests.post(
            f"{BACKEND_URL}/auth/login/",
            json={"test": "endpoint_check"},
            timeout=5
        )
        login_ok = login_response.status_code in [400, 405]
        log_test("Login endpoint exists", login_ok, f"HTTP {login_response.status_code}")
        
        return register_ok and login_ok
        
    except Exception as e:
        log_test("Auth endpoints", False, str(e))
        return False

def test_tasks_endpoints():
    """Test 6: Tasks API endpoints"""
    log_section("TEST 6: Tasks API Endpoints")
    
    try:
        # Without auth, should get 401
        tasks_response = requests.get(f"{BACKEND_URL}/tasks/", timeout=5)
        tasks_ok = tasks_response.status_code in [200, 401]
        log_test("Tasks endpoint exists", tasks_ok, f"HTTP {tasks_response.status_code}")
        
        # Create endpoint
        create_response = requests.post(f"{BACKEND_URL}/tasks/", timeout=5)
        create_ok = create_response.status_code in [400, 401, 405]
        log_test("Create task endpoint exists", create_ok, f"HTTP {create_response.status_code}")
        
        return tasks_ok and create_ok
        
    except Exception as e:
        log_test("Tasks endpoints", False, str(e))
        return False

def test_websocket_path():
    """Test 7: WebSocket path availability"""
    log_section("TEST 7: WebSocket Configuration")
    
    try:
        # Check if NEXT_PUBLIC_WS_URL is configured
        response = requests.get(f"{FRONTEND_URL}/", timeout=5)
        html = response.text
        
        # Look for WebSocket configuration in the HTML/JS
        has_ws_config = "ws://" in html or "wss://" in html or "localhost:8001" in html
        log_test("WebSocket URL configured", has_ws_config)
        
        print(f"     Expected WebSocket URL: {Colors.CYAN}ws://localhost:8001/ws/{Colors.END}")
        
        return has_ws_config
        
    except Exception as e:
        log_test("WebSocket config", False, str(e))
        return False

def test_component_structure():
    """Test 8: React component structure check"""
    log_section("TEST 8: Component Structure")
    
    try:
        response = requests.get(f"{FRONTEND_URL}/", timeout=5)
        html = response.text
        
        # Check for common component patterns
        components = {
            "Main Layout": ["layout", "container", "wrapper"],
            "Navigation": ["navbar", "navlink", "menu"],
            "Kanban Board": ["kanban", "board", "column"],
            "Chat Interface": ["chat", "message", "input"],
            "Agent Panel": ["agent", "status", "panel"],
            "Task List": ["task", "todo", "item"],
        }
        
        found = {}
        for comp_name, keywords in components.items():
            found[comp_name] = any(kw in html for kw in keywords)
            log_test(f"  {comp_name} component", found[comp_name])
        
        found_count = sum(1 for v in found.values() if v)
        print(f"\n     Components found: {Colors.CYAN}{found_count}/{len(components)}{Colors.END}")
        
        return found_count >= 3
        
    except Exception as e:
        log_test("Component structure", False, str(e))
        return False

def main():
    print(f"{Colors.BLUE}{'='*60}")
    print(f"  Heuriskein IA - Frontend Testing Suite")
    print(f"  Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  Frontend: {FRONTEND_URL}")
    print(f"  Backend: {BACKEND_URL}")
    print(f"{'='*60}{Colors.END}")
    
    # Wait a moment for frontend to be ready
    print(f"\n{Colors.YELLOW}Aguardando frontend compilar...{Colors.END}")
    time.sleep(3)
    
    results = {}
    
    # Run all tests
    results["server"] = test_frontend_server()
    
    if not results["server"]:
        print(f"\n{Colors.RED}❌ Frontend não está respondendo!{Colors.END}")
        print(f"Inicie com: {Colors.CYAN}npm run dev{Colors.END} no diretório frontend/")
        return
    
    results["elements"] = test_page_elements()
    results["assets"] = test_static_assets()
    results["api"] = test_api_integration()
    results["auth"] = test_auth_endpoints()
    results["tasks"] = test_tasks_endpoints()
    results["websocket"] = test_websocket_path()
    results["components"] = test_component_structure()
    
    # Summary
    log_section("TEST SUMMARY")
    
    total = len(results)
    passed = sum(1 for v in results.values() if v is True)
    failed = sum(1 for v in results.values() if v is False)
    
    for test_name, result in results.items():
        status = f"{Colors.GREEN}✓{Colors.END}" if result else f"{Colors.RED}✗{Colors.END}"
        print(f"{status} {test_name.upper()}")
    
    print(f"\n{Colors.BLUE}Results: {passed} passed, {failed} failed out of {total} tests{Colors.END}\n")
    
    # Additional info
    if results["server"]:
        print(f"{Colors.CYAN}📊 Frontend Running On: {FRONTEND_URL}{Colors.END}")
        print(f"{Colors.CYAN}🔌 Backend Connected: {BACKEND_URL}{Colors.END}")
        
        if passed == total:
            print(f"\n{Colors.GREEN}✨ Frontend is READY! All systems operational.{Colors.END}")
        else:
            print(f"\n{Colors.YELLOW}⚠️  Some features may not be working correctly.{Colors.END}")

if __name__ == "__main__":
    main()
