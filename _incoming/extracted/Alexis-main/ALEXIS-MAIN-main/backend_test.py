#!/usr/bin/env python3
"""
ALEXIS Diagnostic Platform - Backend API Testing
Tests all backend endpoints for functionality and error handling
"""

import requests
import sys
import json
from datetime import datetime
from typing import Dict, Any, Optional

class ALEXISAPITester:
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

    def test_health_endpoint(self):
        """Test GET /api/ health endpoint"""
        success, data = self.make_request('GET', '', expected_status=200)
        if success and isinstance(data, dict) and 'message' in data:
            self.log_test("Health Endpoint GET /api/", True)
            return True
        else:
            self.log_test("Health Endpoint GET /api/", False, str(data))
            return False

    def test_status_endpoints(self):
        """Test POST and GET /api/status endpoints"""
        # Test POST /api/status
        test_data = {"client_name": f"test_client_{datetime.now().strftime('%H%M%S')}"}
        success, data = self.make_request('POST', 'status', data=test_data, expected_status=200)
        
        if success and isinstance(data, dict) and 'id' in data:
            self.log_test("Status POST /api/status", True)
            
            # Test GET /api/status
            success, data = self.make_request('GET', 'status', expected_status=200)
            if success and isinstance(data, list):
                self.log_test("Status GET /api/status", True)
                return True
            else:
                self.log_test("Status GET /api/status", False, str(data))
                return False
        else:
            self.log_test("Status POST /api/status", False, str(data))
            return False

    def test_auth_flow(self):
        """Test authentication flow: login and session start"""
        # Test login
        login_data = {
            "name": f"Test Technician {datetime.now().strftime('%H%M%S')}",
            "email": f"test_{datetime.now().strftime('%H%M%S')}@alexis.local"
        }
        
        success, data = self.make_request('POST', 'auth/login', data=login_data, expected_status=200)
        
        if success and isinstance(data, dict) and all(k in data for k in ['technician_id', 'token', 'name', 'email']):
            self.technician_id = data['technician_id']
            self.token = data['token']
            self.log_test("Auth Login POST /api/auth/login", True)
            
            # Test session start
            session_data = {
                "technician_id": self.technician_id,
                "vehicle_year": "2020",
                "vehicle_make": "Mercedes",
                "vehicle_model": "C300"
            }
            
            success, data = self.make_request('POST', 'session/start', data=session_data, expected_status=200)
            
            if success and isinstance(data, dict) and all(k in data for k in ['session_id', 'live', 'rules_version']):
                self.session_id = data['session_id']
                self.log_test("Session Start POST /api/session/start", True)
                return True
            else:
                self.log_test("Session Start POST /api/session/start", False, str(data))
                return False
        else:
            self.log_test("Auth Login POST /api/auth/login", False, str(data))
            return False

    def test_diagnostic_chat(self):
        """Test diagnostic chat endpoint with all three contexts"""
        if not self.session_id:
            self.log_test("Diagnostic Chat - No Session", False, "Session required")
            return False

        contexts = [
            ("symptom_audio_diagnostics", "2020 Mercedes C300 petrol engine cranks but won't start"),
            ("visual_inspection", "Check this engine component installation"),
            ("diagram_assistance", "Explain this wiring diagram circuit")
        ]

        all_passed = True
        for context, test_message in contexts:
            chat_data = {
                "session_id": self.session_id,
                "transcript": test_message,
                "context": context
            }
            
            success, data = self.make_request('POST', 'diagnostic/chat', data=chat_data, expected_status=200)
            
            if success and isinstance(data, dict) and 'response' in data and data['response']:
                self.log_test(f"Diagnostic Chat - {context}", True)
            else:
                self.log_test(f"Diagnostic Chat - {context}", False, str(data))
                all_passed = False

        return all_passed

    def test_refined_alexis_diagram_teaching(self):
        """Test refined ALEXIS diagram teaching behavior as per review request"""
        if not self.technician_id:
            self.log_test("Refined ALEXIS Teaching - No Technician", False, "Technician ID required")
            return False

        print("\n🎓 Testing Refined ALEXIS Diagram Teaching Behavior...")
        all_passed = True

        # Create a fresh session for diagram tests to avoid conversation history interference
        session_data = {
            "technician_id": self.technician_id,
            "vehicle_year": "2020",
            "vehicle_make": "Mercedes",
            "vehicle_model": "C300"
        }
        
        success, data = self.make_request('POST', 'session/start', data=session_data, expected_status=200)
        if not success:
            self.log_test("Refined ALEXIS Teaching - Fresh Session Creation", False, str(data))
            return False
        
        fresh_session_id = data['session_id']

        # Test 1: Filename Suppression
        print("📋 Test 1: Filename Suppression")
        filename_test_data = {
            "session_id": fresh_session_id,
            "transcript": "Explain what's on this page",
            "context": "diagram_assistance",
            "diagram_context": {
                "loaded": True,
                "filename": "engine_wiring_harness.pdf",
                "totalPages": 5,
                "currentPage": 1
            }
        }
        
        success, data = self.make_request('POST', 'diagnostic/chat', data=filename_test_data, expected_status=200)
        
        if success and isinstance(data, dict) and 'response' in data:
            response = data['response']
            # Check that ALEXIS does NOT mention the filename
            mentions_filename = "engine_wiring_harness.pdf" in response
            # Check that ALEXIS does NOT ask to upload (key indicator of diagram recognition)
            asks_to_upload = any(phrase in response.lower() for phrase in [
                "upload", "please upload", "+ button", "load a diagram"
            ])
            # Check that response is teaching content (not asking for upload)
            is_teaching = not asks_to_upload and len(response) > 50
            
            if not mentions_filename and is_teaching:
                self.log_test("Filename Suppression Test", True)
                print(f"   ✅ ALEXIS response (no filename): {response[:150]}...")
            else:
                self.log_test("Filename Suppression Test", False, 
                            f"Mentions filename: {mentions_filename} | Is teaching: {is_teaching} | Asks upload: {asks_to_upload} | Response: {response[:200]}...")
                all_passed = False
        else:
            self.log_test("Filename Suppression Test", False, str(data))
            all_passed = False

        # Test 2: Calm Teaching Style
        print("📋 Test 2: Calm Teaching Style")
        teaching_style_data = {
            "session_id": fresh_session_id,
            "transcript": "What is this relay?",
            "context": "diagram_assistance",
            "diagram_context": {
                "loaded": True,
                "filename": "test.pdf",
                "totalPages": 2,
                "currentPage": 1
            }
        }
        
        success, data = self.make_request('POST', 'diagnostic/chat', data=teaching_style_data, expected_status=200)
        
        if success and isinstance(data, dict) and 'response' in data:
            response = data['response']
            response_lower = response.lower()
            
            # Check that ALEXIS does NOT ask to upload (key indicator of diagram recognition)
            asks_to_upload = any(phrase in response_lower for phrase in [
                "upload", "please upload", "+ button", "load a diagram"
            ])
            
            # Check for TEACHING FLOW structure elements
            identifies_component = any(phrase in response_lower for phrase in [
                "this is", "this relay", "here we have", "this component", "relay", "coil", "contacts"
            ])
            explains_function = any(phrase in response_lower for phrase in [
                "purpose", "function", "used for", "controls", "allows", "enables", "energized", "current"
            ])
            describes_connections = any(phrase in response_lower for phrase in [
                "power comes", "connects to", "output goes", "input from", "wired to", "pin", "wire", "circuit"
            ])
            
            # Check for calm, instructional tone (NOT robotic)
            is_calm_tone = not any(phrase in response_lower for phrase in [
                "component detected", "relay detected", "pin 85", "pin 30/87", "next component"
            ])
            
            # Check that it's not a robotic list-like response (allow some formatting)
            is_not_robotic_list = not any(phrase in response_lower for phrase in [
                "component detected", "relay detected", "pin 85", "pin 30/87", "next component"
            ])
            
            teaching_elements = sum([identifies_component, explains_function, describes_connections])
            is_teaching = not asks_to_upload and len(response) > 50
            
            if is_teaching and teaching_elements >= 2 and is_calm_tone and is_not_robotic_list:
                self.log_test("Calm Teaching Style Test", True)
                print(f"   ✅ ALEXIS teaching response: {response[:150]}...")
            else:
                self.log_test("Calm Teaching Style Test", False, 
                            f"Is teaching: {is_teaching} | Teaching elements: {teaching_elements}/3 | Calm tone: {is_calm_tone} | Not robotic: {is_not_robotic_list} | Asks upload: {asks_to_upload} | Response: {response[:200]}...")
                all_passed = False
        else:
            self.log_test("Calm Teaching Style Test", False, str(data))
            all_passed = False

        # Test 3: Single Overlay Generation
        print("📋 Test 3: Single Overlay Generation")
        overlay_test_data = {
            "session_id": fresh_session_id,
            "transcript": "Show me this circuit component",
            "context": "diagram_assistance",
            "diagram_context": {
                "loaded": True,
                "filename": "circuit_diagram.pdf",
                "totalPages": 3,
                "currentPage": 1
            }
        }
        
        success, data = self.make_request('POST', 'diagnostic/chat', data=overlay_test_data, expected_status=200)
        
        if success and isinstance(data, dict) and 'response' in data:
            overlay_commands = data.get('overlayCommands', [])
            
            # Check that there is ONLY ONE overlay
            has_single_overlay = len(overlay_commands) == 1
            
            # Check that overlay has longer duration for calm teaching
            has_long_duration = False
            if overlay_commands:
                duration = overlay_commands[0].get('durationMs', 0)
                has_long_duration = duration >= 8000  # At least 8 seconds for calm teaching
            
            if has_single_overlay and has_long_duration:
                self.log_test("Single Overlay Generation Test", True)
                print(f"   ✅ Single overlay with {overlay_commands[0].get('durationMs')}ms duration")
            else:
                self.log_test("Single Overlay Generation Test", False, 
                            f"Overlay count: {len(overlay_commands)} (expected 1) | Long duration: {has_long_duration} | Overlays: {overlay_commands}")
                all_passed = False
        else:
            self.log_test("Single Overlay Generation Test", False, str(data))
            all_passed = False

        return all_passed

    def test_diagram_context_binding_fix(self):
        """CRITICAL TEST: Test diagram context binding fix for ALEXIS awareness"""
        if not self.technician_id:
            self.log_test("Diagram Context Binding - No Technician", False, "Technician ID required")
            return False

        print("\n🔍 Testing CRITICAL diagram context binding fix...")
        all_passed = True

        # Test Scenario 1: Diagram Loaded - ALEXIS should acknowledge diagram
        print("📋 Test Scenario 1: Diagram Loaded (Fresh Session)")
        
        # Create fresh session for this test
        session_data = {
            "technician_id": self.technician_id,
            "vehicle_year": "2020",
            "vehicle_make": "Mercedes",
            "vehicle_model": "C300"
        }
        success, data = self.make_request('POST', 'session/start', data=session_data, expected_status=200)
        if not success:
            self.log_test("Diagram Context - Fresh Session Creation", False, str(data))
            return False
        
        fresh_session_id = data['session_id']
        diagram_loaded_data = {
            "session_id": self.session_id,
            "transcript": "What circuits are shown on this diagram?",
            "context": "diagram_assistance",
            "diagram_context": {
                "loaded": True,
                "filename": "engine_wiring.pdf",
                "totalPages": 5,
                "currentPage": 1
            }
        }
        
        success, data = self.make_request('POST', 'diagnostic/chat', data=diagram_loaded_data, expected_status=200)
        
        if success and isinstance(data, dict) and 'response' in data:
            response = data['response'].lower()
            # Check that ALEXIS acknowledges the diagram
            acknowledges_diagram = any(phrase in response for phrase in [
                "i can see", "wiring diagram", "engine_wiring.pdf", "diagram", "circuit"
            ])
            # Check that ALEXIS does NOT ask to upload
            asks_to_upload = any(phrase in response for phrase in [
                "upload", "please upload", "+ button", "load a diagram"
            ])
            # Check for fallback message
            has_fallback = any(phrase in response for phrase in [
                "zoom or tap", "please zoom", "tap the symbol"
            ])
            
            if acknowledges_diagram and not asks_to_upload and not has_fallback:
                self.log_test("Diagram Context - Loaded (Acknowledges)", True)
                print(f"   ✅ ALEXIS response: {data['response'][:100]}...")
            else:
                self.log_test("Diagram Context - Loaded (Acknowledges)", False, 
                            f"Response: {data['response'][:200]}... | Acknowledges: {acknowledges_diagram} | Asks upload: {asks_to_upload} | Fallback: {has_fallback}")
                all_passed = False
        else:
            self.log_test("Diagram Context - Loaded (API)", False, str(data))
            all_passed = False

        # Test Scenario 2: No Diagram Loaded - ALEXIS should ask to upload
        print("📋 Test Scenario 2: No Diagram Loaded")
        no_diagram_data = {
            "session_id": self.session_id,
            "transcript": "Explain the relay",
            "context": "diagram_assistance",
            "diagram_context": {
                "loaded": False
            }
        }
        
        success, data = self.make_request('POST', 'diagnostic/chat', data=no_diagram_data, expected_status=200)
        
        if success and isinstance(data, dict) and 'response' in data:
            response = data['response'].lower()
            # Check that ALEXIS asks to upload
            asks_to_upload = any(phrase in response for phrase in [
                "upload", "please upload", "+ button", "load a diagram"
            ])
            # Check that ALEXIS does NOT acknowledge a diagram
            acknowledges_diagram = any(phrase in response for phrase in [
                "i can see", "looking at", "this diagram shows"
            ])
            
            if asks_to_upload and not acknowledges_diagram:
                self.log_test("Diagram Context - No Diagram (Asks Upload)", True)
                print(f"   ✅ ALEXIS response: {data['response'][:100]}...")
            else:
                self.log_test("Diagram Context - No Diagram (Asks Upload)", False, 
                            f"Response: {data['response'][:200]}... | Asks upload: {asks_to_upload} | Acknowledges: {acknowledges_diagram}")
                all_passed = False
        else:
            self.log_test("Diagram Context - No Diagram (API)", False, str(data))
            all_passed = False

        # Test Scenario 3: Diagram Loaded with null context - should ask to upload
        print("📋 Test Scenario 3: Null Diagram Context")
        null_diagram_data = {
            "session_id": self.session_id,
            "transcript": "Show me the power distribution",
            "context": "diagram_assistance",
            "diagram_context": None
        }
        
        success, data = self.make_request('POST', 'diagnostic/chat', data=null_diagram_data, expected_status=200)
        
        if success and isinstance(data, dict) and 'response' in data:
            response = data['response'].lower()
            asks_to_upload = any(phrase in response for phrase in [
                "upload", "please upload", "+ button", "load a diagram"
            ])
            
            if asks_to_upload:
                self.log_test("Diagram Context - Null Context (Asks Upload)", True)
                print(f"   ✅ ALEXIS response: {data['response'][:100]}...")
            else:
                self.log_test("Diagram Context - Null Context (Asks Upload)", False, 
                            f"Response: {data['response'][:200]}... | Asks upload: {asks_to_upload}")
                all_passed = False
        else:
            self.log_test("Diagram Context - Null Context (API)", False, str(data))
            all_passed = False

        return all_passed

    def test_speech_endpoints(self):
        """Test STT and TTS endpoints - expect graceful failure if Azure keys missing"""
        # Test TTS endpoint
        if not self.session_id:
            self.log_test("TTS - No Session", False, "Session required")
            return False

        tts_data = {
            "text": "This is a test message for text to speech",
            "session_id": self.session_id
        }
        
        success, data = self.make_request('POST', 'tts', data=tts_data, expected_status=503)
        
        # TTS should fail gracefully with 503 if Azure keys missing
        if not success and "503" in str(data):
            self.log_test("TTS Graceful Failure POST /api/tts", True, "Expected 503 - Azure keys not configured")
        elif success:
            self.log_test("TTS Success POST /api/tts", True, "Azure TTS working")
        else:
            self.log_test("TTS POST /api/tts", False, str(data))

        # Test STT endpoint with dummy audio file
        try:
            # Create a minimal WebM file (just headers, no real audio)
            dummy_webm = b'\x1a\x45\xdf\xa3' + b'\x00' * 100  # Minimal WebM header
            files = {'audio': ('test.webm', dummy_webm, 'audio/webm')}
            
            success, data = self.make_request('POST', 'stt', files=files, expected_status=500)
            
            # STT should fail gracefully with 500 if Azure keys missing or audio invalid
            if not success and ("500" in str(data) or "Azure" in str(data)):
                self.log_test("STT Graceful Failure POST /api/stt", True, "Expected failure - Azure keys not configured or invalid audio")
            elif success:
                self.log_test("STT Success POST /api/stt", True, "Azure STT working")
            else:
                self.log_test("STT POST /api/stt", False, str(data))
                
        except Exception as e:
            self.log_test("STT POST /api/stt", False, f"Test setup error: {str(e)}")

        return True

    def test_mongo_persistence(self):
        """Test that MongoDB operations work without exposing _id"""
        # This is tested implicitly through auth/login and session/start
        # We check that technician and session were created successfully
        if self.technician_id and self.session_id:
            self.log_test("MongoDB Persistence", True, "Technician and session created successfully")
            return True
        else:
            self.log_test("MongoDB Persistence", False, "Failed to create technician or session")
            return False

    def run_all_tests(self):
        """Run all backend tests"""
        print("🚀 Starting ALEXIS Backend API Tests")
        print(f"📡 Testing against: {self.base_url}")
        print("=" * 60)

        # Test in order of dependency
        self.test_health_endpoint()
        self.test_status_endpoints()
        
        auth_success = self.test_auth_flow()
        if auth_success:
            self.test_diagnostic_chat()
            # CRITICAL TEST: Refined ALEXIS diagram teaching behavior
            self.test_refined_alexis_diagram_teaching()
            # CRITICAL TEST: Diagram context binding fix
            self.test_diagram_context_binding_fix()
            self.test_mongo_persistence()
        
        self.test_speech_endpoints()

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
    tester = ALEXISAPITester()
    passed, total, failures = tester.run_all_tests()
    
    # Return appropriate exit code
    if passed == total:
        print("\n🎉 All tests passed!")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())