#!/usr/bin/env python3
"""
Comprehensive Backend API Test for ALEXIS Diagnostics Portal
Tests all critical endpoints with proper error handling
"""

import requests
import sys
import json
import tempfile
import os
from datetime import datetime

class AlexisAPITester:
    def __init__(self, base_url="https://zipcheck-agent.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})
        self.tests_run = 0
        self.tests_passed = 0
        self.technician_id = None
        self.session_id = None
        
    def log_test(self, name, success, details=""):
        """Log test results"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name} - PASSED {details}")
        else:
            print(f"❌ {name} - FAILED {details}")
        return success

    def test_root_endpoint(self):
        """Test GET /api/ returns message"""
        try:
            response = self.session.get(f"{self.base_url}/")
            success = response.status_code == 200
            if success:
                data = response.json()
                message = data.get("message", "")
                return self.log_test("Root Endpoint", True, f"- Message: {message}")
            else:
                return self.log_test("Root Endpoint", False, f"- Status: {response.status_code}")
        except Exception as e:
            return self.log_test("Root Endpoint", False, f"- Error: {str(e)}")

    def test_login(self):
        """Test POST /api/auth/login"""
        try:
            login_data = {
                "name": "Test Technician",
                "email": f"test_{datetime.now().strftime('%H%M%S')}@example.com"
            }
            
            response = self.session.post(f"{self.base_url}/auth/login", json=login_data)
            success = response.status_code == 200
            
            if success:
                data = response.json()
                self.technician_id = data.get("technician_id")
                token = data.get("token")
                success = bool(self.technician_id and token)
                return self.log_test("Login", success, f"- ID: {self.technician_id[:8]}...")
            else:
                return self.log_test("Login", False, f"- Status: {response.status_code}")
        except Exception as e:
            return self.log_test("Login", False, f"- Error: {str(e)}")

    def test_session_start(self):
        """Test POST /api/session/start"""
        if not self.technician_id:
            return self.log_test("Session Start", False, "- No technician_id from login")
            
        try:
            session_data = {
                "technician_id": self.technician_id,
                "vehicle_year": "2023",
                "vehicle_make": "Toyota",
                "vehicle_model": "Camry"
            }
            
            response = self.session.post(f"{self.base_url}/session/start", json=session_data)
            success = response.status_code == 200
            
            if success:
                data = response.json()
                self.session_id = data.get("session_id")
                live = data.get("live")
                success = bool(self.session_id and live is True)
                return self.log_test("Session Start", success, f"- Live: {live}, ID: {self.session_id[:8]}...")
            else:
                return self.log_test("Session Start", False, f"- Status: {response.status_code}")
        except Exception as e:
            return self.log_test("Session Start", False, f"- Error: {str(e)}")

    def test_diagnostic_chat(self):
        """Test POST /api/diagnostic/chat with symptom_audio_diagnostics context"""
        if not self.session_id:
            return self.log_test("Diagnostic Chat", False, "- No session_id from session start")
            
        try:
            chat_data = {
                "session_id": self.session_id,
                "transcript": "The engine cranks but won't start. No warning lights are on.",
                "context": "symptom_audio_diagnostics"
            }
            
            response = self.session.post(f"{self.base_url}/diagnostic/chat", json=chat_data)
            success = response.status_code == 200
            
            if success:
                data = response.json()
                alexis_response = data.get("response", "")
                success = len(alexis_response) > 10  # Should get meaningful response
                return self.log_test("Diagnostic Chat", success, f"- Response length: {len(alexis_response)} chars")
            else:
                return self.log_test("Diagnostic Chat", False, f"- Status: {response.status_code}")
        except Exception as e:
            return self.log_test("Diagnostic Chat", False, f"- Error: {str(e)}")

    def test_stt_endpoint(self):
        """Test POST /api/stt with a small audio file"""
        try:
            # Create a minimal webm file (just headers, won't actually play but tests the endpoint)
            webm_data = b'\x1a\x45\xdf\xa3\x9f\x42\x86\x81\x01\x42\xf7\x81\x01\x42\xf2\x81\x04\x42\xf3\x81\x08\x42\x82\x84webm\x42\x87\x81\x02\x42\x85\x81\x02'
            
            with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as f:
                f.write(webm_data)
                f.flush()
                
                with open(f.name, 'rb') as audio_file:
                    files = {'audio': ('test.webm', audio_file, 'audio/webm')}
                    # Remove Content-Type header for multipart upload
                    headers = {k: v for k, v in self.session.headers.items() if k.lower() != 'content-type'}
                    response = requests.post(f"{self.base_url}/stt", files=files, headers=headers)
                
                os.unlink(f.name)
            
            success = response.status_code == 200
            if success:
                data = response.json()
                transcript = data.get("transcript", "")
                confidence = data.get("confidence", 0)
                return self.log_test("STT Endpoint", True, f"- Transcript: '{transcript}', Confidence: {confidence}")
            else:
                return self.log_test("STT Endpoint", False, f"- Status: {response.status_code}")
                
        except Exception as e:
            return self.log_test("STT Endpoint", False, f"- Error: {str(e)}")

    def test_tts_endpoint(self):
        """Test POST /api/tts (expected to return 503 if not configured)"""
        if not self.session_id:
            return self.log_test("TTS Endpoint", False, "- No session_id from session start")
            
        try:
            tts_data = {
                "text": "Hello, this is ALEXIS testing text to speech.",
                "session_id": self.session_id
            }
            
            response = self.session.post(f"{self.base_url}/tts", json=tts_data)
            
            # TTS is expected to return 503 when not configured (per requirements)
            if response.status_code == 503:
                return self.log_test("TTS Endpoint", True, "- Returns 503 as expected (not configured)")
            elif response.status_code == 200:
                return self.log_test("TTS Endpoint", True, "- Returns 200 (Azure TTS configured)")
            else:
                return self.log_test("TTS Endpoint", False, f"- Unexpected status: {response.status_code}")
                
        except Exception as e:
            return self.log_test("TTS Endpoint", False, f"- Error: {str(e)}")

    def run_all_tests(self):
        """Run all backend API tests"""
        print("🔍 Starting ALEXIS Backend API Tests...")
        print(f"📡 Base URL: {self.base_url}")
        print("=" * 60)
        
        # Test in logical order
        self.test_root_endpoint()
        self.test_login()
        self.test_session_start()
        self.test_diagnostic_chat()
        self.test_stt_endpoint()
        self.test_tts_endpoint()
        
        print("=" * 60)
        print(f"📊 Backend Test Results: {self.tests_passed}/{self.tests_run} passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All backend tests PASSED!")
            return True
        else:
            print(f"⚠️  {self.tests_run - self.tests_passed} backend tests FAILED")
            return False

def main():
    tester = AlexisAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())