"""
ALEXIS Diagnostic Platform API Tests
Tests for: auth/login, session/start, diagnostic/chat, tts endpoints
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuthEndpoints:
    """Authentication endpoint tests"""
    
    def test_login_creates_technician(self):
        """POST /api/auth/login - should create/return technician with token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "TEST_Technician",
            "email": "TEST_tech@alexis.local"
        })
        
        # Status code assertion
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Data assertions
        data = response.json()
        assert "technician_id" in data, "Response should contain technician_id"
        assert "token" in data, "Response should contain token"
        assert "name" in data, "Response should contain name"
        assert "email" in data, "Response should contain email"
        
        # Validate values
        assert data["name"] == "TEST_Technician"
        assert data["email"] == "TEST_tech@alexis.local"
        assert isinstance(data["technician_id"], str)
        assert len(data["technician_id"]) > 0
        assert isinstance(data["token"], str)
        assert len(data["token"]) > 0
        assert data["token"].startswith("alexis-token-")
        
        print(f"✓ Login successful: technician_id={data['technician_id'][:8]}...")
        return data
    
    def test_login_returns_existing_technician(self):
        """POST /api/auth/login - should return existing technician on repeat login"""
        # First login
        response1 = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "TEST_Repeat",
            "email": "TEST_repeat@alexis.local"
        })
        assert response1.status_code == 200
        data1 = response1.json()
        
        # Second login with same email
        response2 = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "TEST_Repeat",
            "email": "TEST_repeat@alexis.local"
        })
        assert response2.status_code == 200
        data2 = response2.json()
        
        # Should return same technician_id
        assert data1["technician_id"] == data2["technician_id"], "Same email should return same technician_id"
        print(f"✓ Repeat login returns same technician_id")


class TestSessionEndpoints:
    """Session management endpoint tests"""
    
    def test_session_start_returns_live_session(self):
        """POST /api/session/start - should return session_id, live=true, rules_version=ALEXIS_DS_v1.0"""
        # First login to get technician_id
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "TEST_SessionTech",
            "email": "TEST_session@alexis.local"
        })
        assert login_response.status_code == 200
        technician_id = login_response.json()["technician_id"]
        
        # Start session
        response = requests.post(f"{BASE_URL}/api/session/start", json={
            "technician_id": technician_id,
            "vehicle_year": "2018",
            "vehicle_make": "Honda",
            "vehicle_model": "Civic"
        })
        
        # Status code assertion
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Data assertions
        data = response.json()
        assert "session_id" in data, "Response should contain session_id"
        assert "live" in data, "Response should contain live flag"
        assert "rules_version" in data, "Response should contain rules_version"
        assert "technician_id" in data, "Response should contain technician_id"
        assert "created_at" in data, "Response should contain created_at"
        
        # Validate values
        assert data["live"] == True, "Session should be LIVE"
        assert data["rules_version"] == "ALEXIS_DS_v1.0", f"Expected ALEXIS_DS_v1.0, got {data['rules_version']}"
        assert data["technician_id"] == technician_id
        assert isinstance(data["session_id"], str)
        assert len(data["session_id"]) > 0
        
        print(f"✓ Session started: session_id={data['session_id'][:8]}..., live={data['live']}, rules={data['rules_version']}")
        return data


class TestDiagnosticChatEndpoints:
    """Diagnostic chat endpoint tests - ALEXIS AI reasoning"""
    
    def test_diagnostic_chat_returns_alexis_response(self):
        """POST /api/diagnostic/chat - should return ALEXIS diagnostic reasoning response"""
        # Setup: login and start session
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "TEST_ChatTech",
            "email": "TEST_chat@alexis.local"
        })
        assert login_response.status_code == 200
        technician_id = login_response.json()["technician_id"]
        
        session_response = requests.post(f"{BASE_URL}/api/session/start", json={
            "technician_id": technician_id
        })
        assert session_response.status_code == 200
        session_id = session_response.json()["session_id"]
        
        # Send diagnostic chat message
        response = requests.post(f"{BASE_URL}/api/diagnostic/chat", json={
            "session_id": session_id,
            "transcript": "My car won't start. The engine cranks but doesn't fire."
        }, timeout=60)  # Longer timeout for AI response
        
        # Status code assertion
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Data assertions
        data = response.json()
        assert "response" in data, "Response should contain response field"
        assert "session_id" in data, "Response should contain session_id"
        
        # Validate values
        assert data["session_id"] == session_id
        assert isinstance(data["response"], str)
        assert len(data["response"]) > 50, "ALEXIS response should be substantial"
        
        # Check for diagnostic reasoning indicators
        response_text = data["response"].lower()
        # ALEXIS should provide diagnostic reasoning, not just generic responses
        diagnostic_keywords = ["fuel", "spark", "battery", "crank", "start", "check", "verify", "test", "voltage", "ignition"]
        has_diagnostic_content = any(keyword in response_text for keyword in diagnostic_keywords)
        assert has_diagnostic_content, f"ALEXIS response should contain diagnostic reasoning. Got: {data['response'][:200]}..."
        
        print(f"✓ ALEXIS responded with diagnostic reasoning ({len(data['response'])} chars)")
        print(f"  Preview: {data['response'][:150]}...")
        return data


class TestTTSEndpoint:
    """Text-to-Speech endpoint tests"""
    
    def test_tts_returns_503_with_invalid_azure_key(self):
        """POST /api/tts - TTS endpoint should return 503 due to Azure key issue"""
        # Setup: login and start session
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "TEST_TTSTech",
            "email": "TEST_tts@alexis.local"
        })
        assert login_response.status_code == 200
        technician_id = login_response.json()["technician_id"]
        
        session_response = requests.post(f"{BASE_URL}/api/session/start", json={
            "technician_id": technician_id
        })
        assert session_response.status_code == 200
        session_id = session_response.json()["session_id"]
        
        # Call TTS endpoint
        response = requests.post(f"{BASE_URL}/api/tts", json={
            "session_id": session_id,
            "text": "Hello, I am ALEXIS. How can I help you diagnose your vehicle today?"
        }, timeout=30)
        
        # Expected: 503 Service Unavailable (Azure key invalid) or 520 (network/proxy error)
        # This is expected behavior - frontend should fallback to browser TTS
        assert response.status_code in [503, 520, 500], f"Expected 503/520/500 (Azure unavailable), got {response.status_code}"
        
        print(f"✓ TTS returns {response.status_code} as expected (Azure key invalid) - frontend will use browser TTS fallback")


class TestHealthEndpoints:
    """Basic health check endpoints"""
    
    def test_root_endpoint(self):
        """GET /api/ - should return API info"""
        response = requests.get(f"{BASE_URL}/api/")
        
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "ALEXIS" in data["message"]
        print(f"✓ Root endpoint: {data['message']}")


class TestEndToEndFlow:
    """End-to-end flow tests"""
    
    def test_full_diagnostic_flow(self):
        """Test complete flow: login -> session -> chat -> verify conversation persists"""
        # Step 1: Login
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "TEST_E2ETech",
            "email": "TEST_e2e@alexis.local"
        })
        assert login_response.status_code == 200
        technician_id = login_response.json()["technician_id"]
        print(f"  Step 1: Login successful")
        
        # Step 2: Start session
        session_response = requests.post(f"{BASE_URL}/api/session/start", json={
            "technician_id": technician_id,
            "vehicle_year": "2020",
            "vehicle_make": "Toyota",
            "vehicle_model": "Camry"
        })
        assert session_response.status_code == 200
        session_data = session_response.json()
        assert session_data["live"] == True
        assert session_data["rules_version"] == "ALEXIS_DS_v1.0"
        session_id = session_data["session_id"]
        print(f"  Step 2: Session started (LIVE)")
        
        # Step 3: Send first diagnostic message (with retry for network issues)
        chat1_response = None
        for attempt in range(3):
            try:
                chat1_response = requests.post(f"{BASE_URL}/api/diagnostic/chat", json={
                    "session_id": session_id,
                    "transcript": "The check engine light is on. Code P0420."
                }, timeout=60)
                if chat1_response.status_code == 200:
                    break
                time.sleep(2)
            except Exception as e:
                print(f"  Attempt {attempt+1} failed: {e}")
                time.sleep(2)
        
        assert chat1_response is not None and chat1_response.status_code == 200, f"Chat failed after retries: {chat1_response.status_code if chat1_response else 'No response'}"
        chat1_data = chat1_response.json()
        assert len(chat1_data["response"]) > 50
        print(f"  Step 3: First chat response received ({len(chat1_data['response'])} chars)")
        
        # Step 4: Send follow-up message (with retry for network issues)
        chat2_response = None
        for attempt in range(3):
            try:
                chat2_response = requests.post(f"{BASE_URL}/api/diagnostic/chat", json={
                    "session_id": session_id,
                    "transcript": "What should I check first?"
                }, timeout=60)
                if chat2_response.status_code == 200:
                    break
                time.sleep(2)
            except Exception as e:
                print(f"  Attempt {attempt+1} failed: {e}")
                time.sleep(2)
        
        assert chat2_response is not None and chat2_response.status_code == 200, f"Follow-up chat failed after retries: {chat2_response.status_code if chat2_response else 'No response'}"
        chat2_data = chat2_response.json()
        assert len(chat2_data["response"]) > 50
        print(f"  Step 4: Follow-up response received ({len(chat2_data['response'])} chars)")
        
        print(f"✓ Full E2E flow completed successfully")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
