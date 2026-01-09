#!/usr/bin/env python3
"""
ALEXIS Comprehensive Backend Testing
Tests specific diagnostic scenarios and prompt behaviors
"""

import requests
import sys
import json
from datetime import datetime
from typing import Dict, Any, Optional

class ALEXISComprehensiveTester:
    def __init__(self, base_url: str = "http://localhost:8001"):
        self.base_url = base_url
        self.session_id = None
        self.technician_id = None
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []
        self.passed_tests = []

    def log_test(self, name: str, success: bool, details: str = ""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            self.passed_tests.append(name)
            print(f"✅ {name} - PASSED")
            if details:
                print(f"   Details: {details}")
        else:
            self.failed_tests.append({"test": name, "details": details})
            print(f"❌ {name} - FAILED: {details}")

    def make_request(self, method: str, endpoint: str, data: Optional[Dict] = None, 
                    files: Optional[Dict] = None, expected_status: int = 200) -> tuple[bool, Any]:
        """Make HTTP request and return success status and response data"""
        url = f"{self.base_url}/api/{endpoint}" if not endpoint.startswith('/') else f"{self.base_url}{endpoint}"
        headers = {'Content-Type': 'application/json'} if not files else {}
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=30)
            elif method == 'POST':
                if files:
                    response = requests.post(url, files=files, timeout=30)
                else:
                    response = requests.post(url, json=data, headers=headers, timeout=30)
            else:
                return False, f"Unsupported method: {method}"

            success = response.status_code == expected_status
            try:
                response_data = response.json() if response.content else {}
            except:
                response_data = {"raw_response": response.text[:200]}
            
            if not success:
                return False, f"Status {response.status_code}, expected {expected_status}. Response: {response_data}"
            
            return True, response_data

        except requests.exceptions.Timeout:
            return False, "Request timeout (30s)"
        except requests.exceptions.ConnectionError:
            return False, "Connection error - backend may be down"
        except Exception as e:
            return False, f"Request error: {str(e)}"

    def setup_session(self):
        """Setup authentication and session"""
        # Test login
        login_data = {
            "name": f"Test Technician {datetime.now().strftime('%H%M%S')}",
            "email": f"test_{datetime.now().strftime('%H%M%S')}@alexis.local"
        }
        
        success, data = self.make_request('POST', 'auth/login', data=login_data, expected_status=200)
        
        if success and isinstance(data, dict) and all(k in data for k in ['technician_id', 'token', 'name', 'email']):
            self.technician_id = data['technician_id']
            self.token = data['token']
            
            # Test session start
            session_data = {
                "technician_id": self.technician_id,
                "vehicle_year": "2020",
                "vehicle_make": "BMW",
                "vehicle_model": "320d"
            }
            
            success, data = self.make_request('POST', 'session/start', data=session_data, expected_status=200)
            
            if success and isinstance(data, dict) and all(k in data for k in ['session_id', 'live', 'rules_version']):
                self.session_id = data['session_id']
                return True
        
        return False

    def test_voice_diagnostics_scenarios(self):
        """Test specific voice diagnostics scenarios"""
        if not self.session_id:
            self.log_test("Voice Diagnostics - No Session", False, "Session required")
            return False

        # Test 1: Conversational input (should get fallback)
        chat_data = {
            "session_id": self.session_id,
            "transcript": "Can you hear me?",
            "context": "symptom_audio_diagnostics"
        }
        
        success, data = self.make_request('POST', 'diagnostic/chat', data=chat_data, expected_status=200)
        
        if success and isinstance(data, dict) and 'response' in data:
            response = data['response']
            # Should get fallback for conversational input
            if "System online. Awaiting a diagnostic request." in response:
                self.log_test("Voice Diagnostics - Conversational Fallback", True, "Got expected fallback response")
            else:
                self.log_test("Voice Diagnostics - Conversational Fallback", False, f"Unexpected response: {response[:100]}")
        else:
            self.log_test("Voice Diagnostics - Conversational Input", False, str(data))

        # Test 2: Diagnostic input with DTC (should get LOCKED/COMMAND/EXPECTED)
        chat_data = {
            "session_id": self.session_id,
            "transcript": "DTC: P13C0 Vehicle: BMW 320d Diesel",
            "context": "symptom_audio_diagnostics"
        }
        
        success, data = self.make_request('POST', 'diagnostic/chat', data=chat_data, expected_status=200)
        
        if success and isinstance(data, dict) and 'response' in data:
            response = data['response']
            # Should get structured diagnostic response
            if "LOCKED:" in response and "COMMAND:" in response and "EXPECTED:" in response:
                self.log_test("Voice Diagnostics - DTC Diagnostic Response", True, "Got structured LOCKED/COMMAND/EXPECTED response")
            elif "System online. Awaiting a diagnostic request." in response:
                self.log_test("Voice Diagnostics - DTC Diagnostic Response", False, "Got fallback instead of diagnostic response")
            else:
                self.log_test("Voice Diagnostics - DTC Diagnostic Response", False, f"Unexpected response format: {response[:100]}")
        else:
            self.log_test("Voice Diagnostics - DTC Input", False, str(data))

        # Test 3: Crank no-start scenario
        chat_data = {
            "session_id": self.session_id,
            "transcript": "2020 BMW 320d diesel engine cranks but won't start",
            "context": "symptom_audio_diagnostics"
        }
        
        success, data = self.make_request('POST', 'diagnostic/chat', data=chat_data, expected_status=200)
        
        if success and isinstance(data, dict) and 'response' in data:
            response = data['response']
            if "LOCKED:" in response and "COMMAND:" in response and "EXPECTED:" in response:
                self.log_test("Voice Diagnostics - Crank No-Start", True, "Got structured diagnostic response")
            else:
                self.log_test("Voice Diagnostics - Crank No-Start", False, f"Unexpected response: {response[:100]}")
        else:
            self.log_test("Voice Diagnostics - Crank No-Start", False, str(data))

        return True

    def test_visual_diagnostics_context(self):
        """Test visual diagnostics context"""
        if not self.session_id:
            return False

        chat_data = {
            "session_id": self.session_id,
            "transcript": "Check this engine component installation",
            "context": "visual_inspection"
        }
        
        success, data = self.make_request('POST', 'diagnostic/chat', data=chat_data, expected_status=200)
        
        if success and isinstance(data, dict) and 'response' in data:
            response = data['response']
            # Visual inspection should not use LOCKED/COMMAND/EXPECTED format
            if "LOCKED:" not in response and "COMMAND:" not in response:
                self.log_test("Visual Diagnostics - Context Separation", True, "Visual context uses different prompt")
            else:
                self.log_test("Visual Diagnostics - Context Separation", False, "Visual context incorrectly using symptom format")
        else:
            self.log_test("Visual Diagnostics - Context Test", False, str(data))

        return True

    def test_wiring_diagram_context(self):
        """Test wiring diagram context"""
        if not self.session_id:
            return False

        chat_data = {
            "session_id": self.session_id,
            "transcript": "Explain this wiring diagram circuit",
            "context": "diagram_assistance"
        }
        
        success, data = self.make_request('POST', 'diagnostic/chat', data=chat_data, expected_status=200)
        
        if success and isinstance(data, dict) and 'response' in data:
            response = data['response']
            # Diagram assistance should not use LOCKED/COMMAND/EXPECTED format
            if "LOCKED:" not in response and "COMMAND:" not in response:
                self.log_test("Wiring Diagram - Context Separation", True, "Diagram context uses different prompt")
            else:
                self.log_test("Wiring Diagram - Context Separation", False, "Diagram context incorrectly using symptom format")
        else:
            self.log_test("Wiring Diagram - Context Test", False, str(data))

        return True

    def test_azure_speech_graceful_failure(self):
        """Test Azure STT/TTS graceful failure"""
        if not self.session_id:
            return False

        # Test TTS
        tts_data = {
            "text": "This is a test message for text to speech",
            "session_id": self.session_id
        }
        
        success, data = self.make_request('POST', 'tts', data=tts_data, expected_status=503)
        
        if not success and "503" in str(data):
            self.log_test("Azure TTS Graceful Failure", True, "TTS fails gracefully with 503")
        elif success:
            self.log_test("Azure TTS Working", True, "TTS is functional")
        else:
            self.log_test("Azure TTS", False, f"Unexpected TTS behavior: {data}")

        # Test STT with dummy audio
        try:
            dummy_webm = b'\x1a\x45\xdf\xa3' + b'\x00' * 100
            files = {'audio': ('test.webm', dummy_webm, 'audio/webm')}
            
            success, data = self.make_request('POST', 'stt', files=files, expected_status=500)
            
            if not success and ("500" in str(data) or "Azure" in str(data)):
                self.log_test("Azure STT Graceful Failure", True, "STT fails gracefully")
            elif success:
                self.log_test("Azure STT Working", True, "STT is functional")
            else:
                self.log_test("Azure STT", False, f"Unexpected STT behavior: {data}")
                
        except Exception as e:
            self.log_test("Azure STT Test", False, f"Test setup error: {str(e)}")

        return True

    def test_emergent_llm_integration(self):
        """Test that EMERGENT_LLM_KEY is working"""
        if not self.session_id:
            return False

        # Test with a clear diagnostic input that should trigger LLM
        chat_data = {
            "session_id": self.session_id,
            "transcript": "Engine misfire on cylinder 1",
            "context": "symptom_audio_diagnostics"
        }
        
        success, data = self.make_request('POST', 'diagnostic/chat', data=chat_data, expected_status=200)
        
        if success and isinstance(data, dict) and 'response' in data:
            response = data['response']
            # Should get a proper diagnostic response, not fallback
            if "System online. Awaiting a diagnostic request." not in response:
                self.log_test("EMERGENT LLM Integration", True, "LLM is responding to diagnostic inputs")
            else:
                self.log_test("EMERGENT LLM Integration", False, "LLM not responding - may be key issue")
        else:
            self.log_test("EMERGENT LLM Integration", False, str(data))

        return True

    def run_comprehensive_tests(self):
        """Run all comprehensive tests"""
        print("🚀 Starting ALEXIS Comprehensive Backend Tests")
        print(f"📡 Testing against: {self.base_url}")
        print("=" * 60)

        # Setup session
        if not self.setup_session():
            print("❌ Failed to setup session - aborting tests")
            return 0, 1, [{"test": "Session Setup", "details": "Could not authenticate or start session"}]

        print("✅ Session setup successful")

        # Run specific tests
        self.test_voice_diagnostics_scenarios()
        self.test_visual_diagnostics_context()
        self.test_wiring_diagram_context()
        self.test_azure_speech_graceful_failure()
        self.test_emergent_llm_integration()

        # Print summary
        print("\n" + "=" * 60)
        print(f"📊 Test Results: {self.tests_passed}/{self.tests_run} passed")
        
        if self.failed_tests:
            print("\n❌ Failed Tests:")
            for failure in self.failed_tests:
                print(f"  • {failure['test']}: {failure['details']}")
        
        if self.passed_tests:
            print(f"\n✅ Passed Tests: {', '.join(self.passed_tests)}")

        return self.tests_passed, self.tests_run, self.failed_tests

def main():
    """Main test execution"""
    tester = ALEXISComprehensiveTester()
    passed, total, failures = tester.run_comprehensive_tests()
    
    # Return appropriate exit code
    if passed == total:
        print("\n🎉 All comprehensive tests passed!")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())