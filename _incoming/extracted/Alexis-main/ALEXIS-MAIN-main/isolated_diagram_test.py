#!/usr/bin/env python3
"""
Isolated test for diagram context binding - separate sessions
"""

import requests
import json

def create_session():
    """Create a new session"""
    base_url = "https://autorepair-ai.preview.emergentagent.com"
    
    # Login
    login_data = {
        "name": f"Debug Tester {hash(str(requests.get('http://httpbin.org/uuid').json()))}",
        "email": f"debug{hash(str(requests.get('http://httpbin.org/uuid').json()))}@test.com"
    }
    
    response = requests.post(f"{base_url}/api/auth/login", json=login_data)
    if response.status_code != 200:
        print(f"Login failed: {response.text}")
        return None, None
    
    login_result = response.json()
    technician_id = login_result['technician_id']
    
    # Start session
    session_data = {
        "technician_id": technician_id,
        "vehicle_year": "2020",
        "vehicle_make": "Mercedes",
        "vehicle_model": "C300"
    }
    
    response = requests.post(f"{base_url}/api/session/start", json=session_data)
    if response.status_code != 200:
        print(f"Session start failed: {response.text}")
        return None, None
    
    session_result = response.json()
    return base_url, session_result['session_id']

def test_no_diagram_isolated():
    """Test with no diagram in a fresh session"""
    base_url, session_id = create_session()
    if not session_id:
        return False
    
    print(f"\n=== ISOLATED TEST: No Diagram (Session: {session_id}) ===")
    
    chat_data = {
        "session_id": session_id,
        "transcript": "Explain the relay",
        "context": "diagram_assistance",
        "diagram_context": {
            "loaded": False
        }
    }
    
    response = requests.post(f"{base_url}/api/diagnostic/chat", json=chat_data)
    print(f"Response status: {response.status_code}")
    
    if response.status_code == 200:
        result = response.json()
        print(f"Response: {result['response'][:200]}...")
        
        response_text = result['response'].lower()
        asks_upload = any(phrase in response_text for phrase in [
            "upload", "please upload", "+ button"
        ])
        acknowledges = any(phrase in response_text for phrase in [
            "i can see", "looking at", "this diagram shows", "engine_wiring.pdf"
        ])
        
        print(f"Asks to upload: {asks_upload}")
        print(f"Acknowledges diagram: {acknowledges}")
        print(f"Expected: Asks=True, Acknowledges=False")
        
        if asks_upload and not acknowledges:
            print("✅ ISOLATED TEST PASSED")
            return True
        else:
            print("❌ ISOLATED TEST FAILED")
            return False
    else:
        print(f"Request failed: {response.text}")
        return False

def test_diagram_loaded_isolated():
    """Test with diagram loaded in a fresh session"""
    base_url, session_id = create_session()
    if not session_id:
        return False
    
    print(f"\n=== ISOLATED TEST: Diagram Loaded (Session: {session_id}) ===")
    
    chat_data = {
        "session_id": session_id,
        "transcript": "What circuits are shown on this diagram?",
        "context": "diagram_assistance",
        "diagram_context": {
            "loaded": True,
            "filename": "engine_wiring.pdf",
            "totalPages": 5,
            "currentPage": 1
        }
    }
    
    response = requests.post(f"{base_url}/api/diagnostic/chat", json=chat_data)
    print(f"Response status: {response.status_code}")
    
    if response.status_code == 200:
        result = response.json()
        print(f"Response: {result['response'][:200]}...")
        
        response_text = result['response'].lower()
        acknowledges = any(phrase in response_text for phrase in [
            "i can see", "wiring diagram", "engine_wiring.pdf", "diagram"
        ])
        asks_upload = any(phrase in response_text for phrase in [
            "upload", "please upload", "+ button"
        ])
        
        print(f"Acknowledges diagram: {acknowledges}")
        print(f"Asks to upload: {asks_upload}")
        print(f"Expected: Acknowledges=True, Asks=False")
        
        if acknowledges and not asks_upload:
            print("✅ ISOLATED TEST PASSED")
            return True
        else:
            print("❌ ISOLATED TEST FAILED")
            return False
    else:
        print(f"Request failed: {response.text}")
        return False

if __name__ == "__main__":
    print("🔍 Testing diagram context binding with isolated sessions...")
    
    test1_passed = test_diagram_loaded_isolated()
    test2_passed = test_no_diagram_isolated()
    
    print(f"\n📊 Results:")
    print(f"Diagram Loaded Test: {'✅ PASSED' if test1_passed else '❌ FAILED'}")
    print(f"No Diagram Test: {'✅ PASSED' if test2_passed else '❌ FAILED'}")
    
    if test1_passed and test2_passed:
        print("🎉 All tests passed!")
    else:
        print("⚠️ Some tests failed")