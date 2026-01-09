#!/usr/bin/env python3
"""
Final test for diagram context binding fix
"""

import requests
import json

def create_session():
    """Create a new session"""
    base_url = "https://autorepair-ai.preview.emergentagent.com"
    
    # Login
    login_data = {
        "name": f"Final Tester",
        "email": f"final@test.com"
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

def run_final_tests():
    """Run the final diagram context binding tests"""
    print("🔍 FINAL TEST: Diagram Context Binding Fix")
    print("=" * 60)
    
    tests_passed = 0
    total_tests = 2
    
    # Test 1: Diagram Loaded
    print("\n📋 Test 1: Diagram Loaded")
    base_url, session_id = create_session()
    if not session_id:
        print("❌ Failed to create session")
        return False
    
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
    if response.status_code == 200:
        result = response.json()
        response_text = result['response'].lower()
        
        acknowledges = any(phrase in response_text for phrase in [
            "i can see", "wiring diagram", "engine_wiring.pdf"
        ])
        asks_upload = any(phrase in response_text for phrase in [
            "upload", "please upload", "+ button", "attach", "no diagram was attached"
        ])
        
        print(f"Response: {result['response'][:150]}...")
        print(f"Acknowledges diagram: {acknowledges}")
        print(f"Asks to upload: {asks_upload}")
        
        if acknowledges and not asks_upload:
            print("✅ Test 1 PASSED")
            tests_passed += 1
        else:
            print("❌ Test 1 FAILED")
    else:
        print(f"❌ Test 1 FAILED - API Error: {response.status_code}")
    
    # Test 2: No Diagram
    print("\n📋 Test 2: No Diagram Loaded")
    base_url, session_id = create_session()
    if not session_id:
        print("❌ Failed to create session")
        return False
    
    chat_data = {
        "session_id": session_id,
        "transcript": "Explain the relay",
        "context": "diagram_assistance",
        "diagram_context": {
            "loaded": False
        }
    }
    
    response = requests.post(f"{base_url}/api/diagnostic/chat", json=chat_data)
    if response.status_code == 200:
        result = response.json()
        response_text = result['response'].lower()
        
        asks_upload = any(phrase in response_text for phrase in [
            "upload", "please upload", "+ button"
        ])
        acknowledges = any(phrase in response_text for phrase in [
            "i can see", "engine_wiring.pdf", "this diagram shows"
        ])
        
        print(f"Response: {result['response'][:150]}...")
        print(f"Asks to upload: {asks_upload}")
        print(f"Acknowledges diagram: {acknowledges}")
        
        if asks_upload and not acknowledges:
            print("✅ Test 2 PASSED")
            tests_passed += 1
        else:
            print("❌ Test 2 FAILED")
    else:
        print(f"❌ Test 2 FAILED - API Error: {response.status_code}")
    
    print(f"\n📊 Final Results: {tests_passed}/{total_tests} tests passed")
    
    if tests_passed == total_tests:
        print("🎉 DIAGRAM CONTEXT BINDING FIX WORKING!")
        return True
    else:
        print("⚠️ DIAGRAM CONTEXT BINDING FIX HAS ISSUES")
        return False

if __name__ == "__main__":
    success = run_final_tests()
    exit(0 if success else 1)