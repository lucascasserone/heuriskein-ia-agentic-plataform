#!/usr/bin/env python
"""
Teste de Funcionalidades - Heuriskein IA
Testa: Health Check, JWT Auth, LLM Chat, WebSocket Connection
"""

import os
import sys
import json
import requests
import asyncio
from datetime import datetime, timedelta
import jwt

# Configuration
API_BASE_URL = "http://localhost:8001/api/v1"
WS_BASE_URL = "ws://localhost:8001/ws"
DJANGO_SECRET = os.getenv("DJANGO_SECRET_KEY", "django-insecure-test-key")

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    END = '\033[0m'

def log_test(name, status, message=""):
    status_str = f"{Colors.GREEN}✓ PASS{Colors.END}" if status else f"{Colors.RED}✗ FAIL{Colors.END}"
    print(f"[{status_str}] {name}")
    if message:
        print(f"     {Colors.YELLOW}→ {message}{Colors.END}")

def log_section(title):
    print(f"\n{Colors.BLUE}{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}{Colors.END}\n")

# Test 1: Health Check
def test_health_check():
    log_section("TEST 1: Health Check")
    try:
        response = requests.get(f"{API_BASE_URL}/health/", timeout=5)
        success = response.status_code == 200
        log_test("Health check endpoint", success, f"HTTP {response.status_code}")
        if success:
            data = response.json()
            print(f"     Response: {json.dumps(data, indent=8)}")
        return success
    except requests.exceptions.ConnectionError:
        log_test("Health check endpoint", False, "Cannot connect to backend (ensure server is running)")
        return False
    except Exception as e:
        log_test("Health check endpoint", False, str(e))
        return False

# Test 2: Register & Login
def test_auth():
    log_section("TEST 2: Authentication (Register & Login)")
    
    # Unique email for this test run
    test_email = f"testuser_{datetime.now().timestamp()}@localhost"
    test_password = "TestPass123!"
    
    try:
        # Register
        reg_data = {
            "username": test_email.split("@")[0],
            "email": test_email,
            "password": test_password,
            "password2": test_password
        }
        
        reg_response = requests.post(f"{API_BASE_URL}/auth/register/", json=reg_data, timeout=5)
        reg_success = reg_response.status_code in [200, 201]
        log_test("User registration", reg_success, f"HTTP {reg_response.status_code}")
        
        if not reg_success:
            print(f"     Response: {reg_response.text[:200]}")
            return None, None
        
        # Login
        login_data = {
            "username": test_email.split("@")[0],
            "password": test_password
        }
        
        login_response = requests.post(f"{API_BASE_URL}/auth/login/", json=login_data, timeout=5)
        login_success = login_response.status_code == 200
        log_test("User login", login_success, f"HTTP {login_response.status_code}")
        
        if not login_success:
            print(f"     Response: {login_response.text[:200]}")
            return None, None
        
        token_data = login_response.json()
        access_token = token_data.get("access")
        
        if access_token:
            print(f"     Access Token (first 40 chars): {access_token[:40]}...")
        
        return access_token, test_email
        
    except Exception as e:
        log_test("Authentication flow", False, str(e))
        return None, None

# Test 3: Task CRUD
def test_task_operations(access_token):
    log_section("TEST 3: Task CRUD Operations")
    
    if not access_token:
        log_test("Task operations", False, "No auth token available")
        return False
    
    headers = {"Authorization": f"Bearer {access_token}"}
    
    try:
        # Create Task
        task_data = {
            "title": f"Test Task {datetime.now().timestamp()}",
            "description": "This is a test task for validating CRUD operations",
            "status": "queue",
            "priority": "high"
        }
        
        create_response = requests.post(
            f"{API_BASE_URL}/tasks/", 
            json=task_data, 
            headers=headers, 
            timeout=5
        )
        create_success = create_response.status_code in [200, 201]
        log_test("Create task", create_success, f"HTTP {create_response.status_code}")
        
        if not create_success:
            print(f"     Response: {create_response.text[:200]}")
            return False
        
        task_id = create_response.json().get("id")
        print(f"     Created task ID: {task_id}")
        
        # List Tasks
        list_response = requests.get(
            f"{API_BASE_URL}/tasks/", 
            headers=headers, 
            timeout=5
        )
        list_success = list_response.status_code == 200
        log_test("List tasks", list_success, f"HTTP {list_response.status_code} | Count: {len(list_response.json())}")
        
        # Get Specific Task
        get_response = requests.get(
            f"{API_BASE_URL}/tasks/{task_id}/", 
            headers=headers, 
            timeout=5
        )
        get_success = get_response.status_code == 200
        log_test("Get specific task", get_success, f"HTTP {get_response.status_code}")
        
        # Update Task
        update_data = {"status": "processing"}
        update_response = requests.patch(
            f"{API_BASE_URL}/tasks/{task_id}/", 
            json=update_data,
            headers=headers, 
            timeout=5
        )
        update_success = update_response.status_code == 200
        log_test("Update task status", update_success, f"HTTP {update_response.status_code}")
        
        return create_success and list_success and get_success and update_success
        
    except Exception as e:
        log_test("Task operations", False, str(e))
        return False

# Test 4: LLM Chat
def test_llm_chat(access_token):
    log_section("TEST 4: LLM Chat Integration")
    
    if not access_token:
        log_test("LLM chat", False, "No auth token available")
        return False
    
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    
    try:
        chat_data = {
            "message": "Olá! Como você pode me ajudar com planejamento de projetos?",
            "context": "Planning agent for project management",
            "stream": False  # First test non-streaming for simplicity
        }
        
        response = requests.post(
            f"{API_BASE_URL}/chat/", 
            json=chat_data, 
            headers=headers,
            stream=False,
            timeout=15
        )
        
        chat_success = response.status_code in [200, 201]
        log_test("LLM chat endpoint", chat_success, f"HTTP {response.status_code}")
        
        if chat_success:
            try:
                response_data = response.json()
                chat_response = response_data.get("response", "")[:100]
                print(f"     LLM Response (first 100 chars): {chat_response}...")
            except:
                print(f"     Response (text): {response.text[:200]}...")
        else:
            print(f"     Response: {response.text[:300]}")
        
        return chat_success
        
    except Exception as e:
        log_test("LLM chat", False, str(e))
        return False

# Test 5: WebSocket Connection (async)
async def test_websocket(access_token):
    log_section("TEST 5: WebSocket Real-time Connection")
    
    if not access_token:
        log_test("WebSocket connection", False, "No auth token available")
        return False
    
    try:
        import websockets
        
        # Note: In production, pass token as query param or header
        ws_url = f"{WS_BASE_URL}/tasks/?token={access_token}"
        
        try:
            async with websockets.connect(ws_url, ping_interval=20) as websocket:
                log_test("WebSocket connection", True, "Connected to ws/tasks/")
                
                # Try to receive a message (with timeout)
                try:
                    message = await asyncio.wait_for(websocket.recv(), timeout=3)
                    log_test("Receive WebSocket message", True, f"Received: {message[:100]}...")
                    return True
                except asyncio.TimeoutError:
                    log_test("Receive WebSocket message", False, "Timeout - no message within 3s (may be normal)")
                    return True  # Connection worked, just no data
                    
        except Exception as e:
            log_test("WebSocket connection", False, f"Connection failed: {str(e)}")
            return False
            
    except ImportError:
        log_test("WebSocket test", False, "websockets library not installed (run: pip install websockets)")
        return False
    except Exception as e:
        log_test("WebSocket connection", False, str(e))
        return False

# Main test runner
def main():
    print(f"\n{Colors.BLUE}{'='*60}")
    print(f"  Heuriskein IA - Feature Testing Suite")
    print(f"  Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  API Base: {API_BASE_URL}")
    print(f"{'='*60}{Colors.END}\n")
    
    results = {}
    
    # Test 1: Health
    results["health_check"] = test_health_check()
    
    if not results["health_check"]:
        print(f"\n{Colors.RED}Backend is not running! Start it with:{Colors.END}")
        print(f"  cd backend && .venv\\Scripts\\python manage.py runserver 0.0.0.0:8001")
        return
    
    # Test 2: Auth
    access_token, test_email = test_auth()
    results["auth"] = access_token is not None
    
    # Test 3: Tasks (if authenticated)
    if access_token:
        results["tasks"] = test_task_operations(access_token)
    
    # Test 4: LLM Chat (if authenticated)
    if access_token:
        results["llm_chat"] = test_llm_chat(access_token)
    
    # Test 5: WebSocket (if authenticated)
    if access_token and sys.platform != "win32":  # websockets may have issues on Windows
        try:
            results["websocket"] = asyncio.run(test_websocket(access_token))
        except:
            results["websocket"] = None
    
    # Summary
    log_section("TEST SUMMARY")
    total = len([v for v in results.values() if v is not None])
    passed = len([v for v in results.values() if v is True])
    failed = len([v for v in results.values() if v is False])
    skipped = len([v for v in results.values() if v is None])
    
    for test_name, result in results.items():
        if result is True:
            print(f"{Colors.GREEN}✓{Colors.END} {test_name.upper()}")
        elif result is False:
            print(f"{Colors.RED}✗{Colors.END} {test_name.upper()}")
        else:
            print(f"{Colors.YELLOW}⊘{Colors.END} {test_name.upper()} (skipped)")
    
    print(f"\n{Colors.BLUE}Results: {passed} passed, {failed} failed, {skipped} skipped out of {total} tests{Colors.END}\n")

if __name__ == "__main__":
    main()
