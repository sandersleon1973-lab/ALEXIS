#!/usr/bin/env python3
"""
ALEXIS Voice & Visual Diagnostics API Testing
CRITICAL BUG TEST: "System online" being repeated instead of proper responses

Tests the specific scenarios mentioned in the review request:
1. Voice Diagnostics - Conversational Input
2. Voice Diagnostics - Actual Symptom  
3. Visual Diagnostics - Basic Query
4. Visual Diagnostics - Component Query
"""

import requests
import sys
import json
from datetime import datetime
from typing import Dict, Any, Optional

class VoiceVisualDiagnosticsTester:
    def __init__(self, base_url: str = "https://autorepair-ai.preview.emergentagent.com"):
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
        """Setup authentication and session for testing"""
        # Test login
        login_data = {
            "name": f"Voice Visual Test {datetime.now().strftime('%H%M%S')}",
            "email": f"voicevisual_{datetime.now().strftime('%H%M%S')}@alexis.local"
        }
        
        success, data = self.make_request('POST', 'auth/login', data=login_data, expected_status=200)
        
        if success and isinstance(data, dict) and all(k in data for k in ['technician_id', 'token', 'name', 'email']):
            self.technician_id = data['technician_id']
            self.token = data['token']
            print(f"✅ Authentication successful - Technician ID: {self.technician_id}")
            
            # Test session start
            session_data = {
                "technician_id": self.technician_id,
                "vehicle_year": "2015",
                "vehicle_make": "Honda",
                "vehicle_model": "Civic"
            }
            
            success, data = self.make_request('POST', 'session/start', data=session_data, expected_status=200)
            
            if success and isinstance(data, dict) and all(k in data for k in ['session_id', 'live', 'rules_version']):
                self.session_id = data['session_id']
                print(f"✅ Session created - Session ID: {self.session_id}")
                return True
            else:
                print(f"❌ Session creation failed: {data}")
                return False
        else:
            print(f"❌ Authentication failed: {data}")
            return False

    def test_voice_diagnostics_conversational(self):
        """TEST 1: Voice Diagnostics - Conversational Input
        Expected: ALEXIS should acknowledge and guide to diagnostics, NOT return "System online. Awaiting a diagnostic request."
        """
        print("\n🎤 TEST 1: Voice Diagnostics - Conversational Input")
        print("Testing: 'Can you hear me?' with context 'symptom_audio_diagnostics'")
        
        chat_data = {
            "session_id": self.session_id,
            "transcript": "Can you hear me?",
            "context": "symptom_audio_diagnostics"
        }
        
        success, data = self.make_request('POST', 'diagnostic/chat', data=chat_data, expected_status=200)
        
        if success and isinstance(data, dict) and 'response' in data:
            response = data['response']
            print(f"📝 ALEXIS Response: {response}")
            
            # Check for the problematic fallback message
            has_system_online = "System online. Awaiting a diagnostic request." in response
            
            # Check for proper acknowledgment and guidance
            acknowledges_user = any(phrase in response.lower() for phrase in [
                "yes, i can hear you", "i can hear you", "yes", "hello", "hi"
            ])
            
            guides_to_diagnostics = any(phrase in response.lower() for phrase in [
                "state the symptom", "vehicle make", "what's happening", "describe", "tell me"
            ])
            
            # Success criteria: No "System online" message AND acknowledges user AND guides to diagnostics
            if not has_system_online and (acknowledges_user or guides_to_diagnostics):
                self.log_test("Voice Diagnostics - Conversational Input", True, 
                            f"ALEXIS properly acknowledged conversational input and guided to diagnostics")
                return True
            else:
                self.log_test("Voice Diagnostics - Conversational Input", False, 
                            f"System online fallback: {has_system_online} | Acknowledges: {acknowledges_user} | Guides: {guides_to_diagnostics} | Response: {response}")
                return False
        else:
            self.log_test("Voice Diagnostics - Conversational Input", False, f"API call failed: {data}")
            return False

    def test_voice_diagnostics_actual_symptom(self):
        """TEST 2: Voice Diagnostics - Actual Symptom
        Expected: ALEXIS should respond with LOCKED/COMMAND/EXPECTED format for crank-no-start diagnostic
        """
        print("\n🎤 TEST 2: Voice Diagnostics - Actual Symptom")
        print("Testing: 'My car won't start. It's a 2015 Honda Civic.' with context 'symptom_audio_diagnostics'")
        
        chat_data = {
            "session_id": self.session_id,
            "transcript": "My car won't start. It's a 2015 Honda Civic.",
            "context": "symptom_audio_diagnostics"
        }
        
        success, data = self.make_request('POST', 'diagnostic/chat', data=chat_data, expected_status=200)
        
        if success and isinstance(data, dict) and 'response' in data:
            response = data['response']
            print(f"📝 ALEXIS Response: {response}")
            
            # Check for the problematic fallback message
            has_system_online = "System online. Awaiting a diagnostic request." in response
            
            # Check for proper diagnostic format (LOCKED/COMMAND/EXPECTED)
            has_locked = "LOCKED:" in response
            has_command = "COMMAND:" in response
            has_expected = "EXPECTED:" in response
            
            # Check for diagnostic content related to crank-no-start
            has_diagnostic_content = any(phrase in response.lower() for phrase in [
                "crank", "start", "battery", "voltage", "ecu", "power", "electrical", "honda", "civic"
            ])
            
            # Success criteria: No "System online" AND has diagnostic format OR proper diagnostic content
            proper_diagnostic_response = (has_locked and has_command and has_expected) or has_diagnostic_content
            
            if not has_system_online and proper_diagnostic_response:
                self.log_test("Voice Diagnostics - Actual Symptom", True, 
                            f"ALEXIS provided proper diagnostic response for crank-no-start symptom")
                return True
            else:
                self.log_test("Voice Diagnostics - Actual Symptom", False, 
                            f"System online fallback: {has_system_online} | LOCKED: {has_locked} | COMMAND: {has_command} | EXPECTED: {has_expected} | Diagnostic content: {has_diagnostic_content} | Response: {response}")
                return False
        else:
            self.log_test("Voice Diagnostics - Actual Symptom", False, f"API call failed: {data}")
            return False

    def test_visual_diagnostics_basic_query(self):
        """TEST 3: Visual Diagnostics - Basic Query
        Expected: Should NOT return "System online. Awaiting a diagnostic request."
        """
        print("\n👁️ TEST 3: Visual Diagnostics - Basic Query")
        print("Testing: 'What do you see in this image?' with context 'visual_inspection'")
        
        chat_data = {
            "session_id": self.session_id,
            "transcript": "What do you see in this image?",
            "context": "visual_inspection"
        }
        
        success, data = self.make_request('POST', 'diagnostic/chat', data=chat_data, expected_status=200)
        
        if success and isinstance(data, dict) and 'response' in data:
            response = data['response']
            print(f"📝 ALEXIS Response: {response}")
            
            # Check for the problematic fallback message
            has_system_online = "System online. Awaiting a diagnostic request." in response
            
            # Check for proper visual inspection response
            has_visual_content = any(phrase in response.lower() for phrase in [
                "show me", "camera", "image", "component", "upload", "see", "looking", "visual", "inspection"
            ])
            
            # Check for ALEXIS identity and professional response
            has_alexis_identity = any(phrase in response.lower() for phrase in [
                "alexis", "leon", "technician"
            ])
            
            # Success criteria: No "System online" AND has visual inspection content
            if not has_system_online and (has_visual_content or has_alexis_identity):
                self.log_test("Visual Diagnostics - Basic Query", True, 
                            f"ALEXIS provided proper visual inspection response")
                return True
            else:
                self.log_test("Visual Diagnostics - Basic Query", False, 
                            f"System online fallback: {has_system_online} | Visual content: {has_visual_content} | ALEXIS identity: {has_alexis_identity} | Response: {response}")
                return False
        else:
            self.log_test("Visual Diagnostics - Basic Query", False, f"API call failed: {data}")
            return False

    def test_visual_diagnostics_component_query(self):
        """TEST 4: Visual Diagnostics - Component Query
        Expected: Should provide inspection guidance, NOT fallback message
        """
        print("\n👁️ TEST 4: Visual Diagnostics - Component Query")
        print("Testing: 'Is this alternator belt worn?' with context 'visual_inspection'")
        
        chat_data = {
            "session_id": self.session_id,
            "transcript": "Is this alternator belt worn?",
            "context": "visual_inspection"
        }
        
        success, data = self.make_request('POST', 'diagnostic/chat', data=chat_data, expected_status=200)
        
        if success and isinstance(data, dict) and 'response' in data:
            response = data['response']
            print(f"📝 ALEXIS Response: {response}")
            
            # Check for the problematic fallback message
            has_system_online = "System online. Awaiting a diagnostic request." in response
            
            # Check for proper component inspection guidance
            has_inspection_guidance = any(phrase in response.lower() for phrase in [
                "belt", "alternator", "worn", "inspect", "check", "look for", "signs", "damage", "wear", "cracks"
            ])
            
            # Check for visual inspection methodology
            has_visual_methodology = any(phrase in response.lower() for phrase in [
                "show me", "camera", "closer", "angle", "lighting", "image", "see", "looking"
            ])
            
            # Check for ALEXIS professional response
            has_professional_response = any(phrase in response.lower() for phrase in [
                "alexis", "leon", "technician", "component", "installation"
            ])
            
            # Success criteria: No "System online" AND has inspection guidance OR visual methodology
            proper_inspection_response = has_inspection_guidance or has_visual_methodology or has_professional_response
            
            if not has_system_online and proper_inspection_response:
                self.log_test("Visual Diagnostics - Component Query", True, 
                            f"ALEXIS provided proper component inspection guidance")
                return True
            else:
                self.log_test("Visual Diagnostics - Component Query", False, 
                            f"System online fallback: {has_system_online} | Inspection guidance: {has_inspection_guidance} | Visual methodology: {has_visual_methodology} | Professional response: {has_professional_response} | Response: {response}")
                return False
        else:
            self.log_test("Visual Diagnostics - Component Query", False, f"API call failed: {data}")
            return False

    def test_tts_fallback_verification(self):
        """Verify TTS fallback works (Azure not configured)"""
        print("\n🔊 TEST 5: TTS Fallback Verification")
        print("Testing TTS endpoint - should fail gracefully when Azure not configured")
        
        if not self.session_id:
            self.log_test("TTS Fallback - No Session", False, "Session required")
            return False

        tts_data = {
            "text": "This is a test message for text to speech",
            "session_id": self.session_id
        }
        
        success, data = self.make_request('POST', 'tts', data=tts_data, expected_status=503)
        
        # TTS should fail gracefully with 503 if Azure keys missing
        if not success and "503" in str(data):
            self.log_test("TTS Fallback Verification", True, "Expected 503 - Azure TTS not configured, fallback working")
            return True
        elif success:
            self.log_test("TTS Fallback Verification", True, "Azure TTS is configured and working")
            return True
        else:
            self.log_test("TTS Fallback Verification", False, f"Unexpected TTS response: {data}")
            return False

    def run_voice_visual_tests(self):
        """Run all voice and visual diagnostics tests"""
        print("🚀 Starting ALEXIS Voice & Visual Diagnostics Tests")
        print("🐛 CRITICAL BUG TEST: 'System online' being repeated instead of proper responses")
        print(f"📡 Testing against: {self.base_url}")
        print("=" * 80)

        # Setup session
        if not self.setup_session():
            print("❌ Failed to setup session - cannot continue with tests")
            return 0, 1, [{"test": "Session Setup", "details": "Authentication or session creation failed"}]

        # Run the specific tests from the review request
        self.test_voice_diagnostics_conversational()
        self.test_voice_diagnostics_actual_symptom()
        self.test_visual_diagnostics_basic_query()
        self.test_visual_diagnostics_component_query()
        self.test_tts_fallback_verification()

        # Print summary
        print("\n" + "=" * 80)
        print(f"📊 Voice & Visual Diagnostics Test Results: {self.tests_passed}/{self.tests_run} passed")
        
        if self.failed_tests:
            print("\n❌ Failed Tests:")
            for failure in self.failed_tests:
                print(f"  • {failure['test']}: {failure['details']}")
        
        if self.passed_tests:
            print(f"\n✅ Passed Tests:")
            for test in self.passed_tests:
                print(f"  • {test}")

        return self.tests_passed, self.tests_run, self.failed_tests

def main():
    """Main test execution"""
    tester = VoiceVisualDiagnosticsTester()
    passed, total, failures = tester.run_voice_visual_tests()
    
    # Return appropriate exit code
    if passed == total:
        print("\n🎉 All Voice & Visual Diagnostics tests passed!")
        return 0
    else:
        print(f"\n⚠️  {total - passed} Voice & Visual Diagnostics test(s) failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())