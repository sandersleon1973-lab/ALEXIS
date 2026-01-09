#!/usr/bin/env python3
"""
Debug test for ALEXIS diagram context binding
"""

import requests
import json

def test_diagram_context():
    base_url = "https://autorepair-ai.preview.emergentagent.com"
    
    # Login first
    login_data = {
        "name": "Debug Tester",
        "email": "debug@test.com"
    }
    
    response = requests.post(f"{base_url}/api/auth/login", json=login_data)
    if response.status_code != 200:
        print(f"Login failed: {response.text}")
        return
    
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
        return
    
    session_result = response.json()
    session_id = session_result['session_id']
    
    # Test with diagram loaded
    print("Testing with diagram loaded...")
    chat_data = {
        "session_id": session_id,
        "transcript": "Explain what's on this page",
        "context": "diagram_assistance",
        "diagram_context": {
            "loaded": True,
            "filename": "engine_wiring_harness.pdf",
            "totalPages": 5,
            "currentPage": 1
        }
    }
    
    response = requests.post(f"{base_url}/api/diagnostic/chat", json=chat_data)
    if response.status_code != 200:
        print(f"Chat failed: {response.text}")
        return
    
    result = response.json()
    print(f"Response: {result['response']}")
    print(f"Overlays: {result.get('overlayCommands', [])}")
    
    # Check if filename is mentioned
    mentions_filename = "engine_wiring_harness.pdf" in result['response']
    asks_to_upload = any(phrase in result['response'].lower() for phrase in [
        "upload", "please upload", "+ button", "load a diagram"
    ])
    
    print(f"Mentions filename: {mentions_filename}")
    print(f"Asks to upload: {asks_to_upload}")

if __name__ == "__main__":
    test_diagram_context()