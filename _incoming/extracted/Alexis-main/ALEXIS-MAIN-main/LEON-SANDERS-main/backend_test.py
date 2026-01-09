#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime
import uuid

class AlexisAPITester:
    def __init__(self, base_url="https://autorepair-ai.preview.emergentagent.com"):
        self.base_url = base_url
        self.session_id = None
        self.technician_id = None
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []
        self.passed_tests = []

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            self.passed_tests.append(name)
            print(f"✅ {name} - PASSED")
        else:
            self.failed_tests.append({"test": name, "details": details})
            print(f"❌ {name} - FAILED: {details}")

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        if headers:
            test_headers.update(headers)
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'

        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, timeout=30)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers, timeout=30)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers, timeout=30)

            print(f"   Status: {response.status_code}")
            
            success = response.status_code == expected_status
            if success:
                try:
                    response_data = response.json()
                    print(f"   Response: {json.dumps(response_data, indent=2)[:200]}...")
                    self.log_test(name, True)
                    return True, response_data
                except:
                    # For non-JSON responses (like TTS)
                    self.log_test(name, True)
                    return True, {}
            else:
                try:
                    error_data = response.json()
                    error_msg = f"Expected {expected_status}, got {response.status_code}. Response: {error_data}"
                except:
                    error_msg = f"Expected {expected_status}, got {response.status_code}. Response: {response.text[:200]}"
                
                self.log_test(name, False, error_msg)
                return False, {}

        except Exception as e:
            error_msg = f"Request failed: {str(e)}"
            self.log_test(name, False, error_msg)
            return False, {}

    def test_health_check(self):
        """Test 1: Backend /api/ health check endpoint returns ALEXIS message"""
        success, response = self.run_test(
            "Health Check - ALEXIS Message",
            "GET",
            "api/",
            200
        )
        if success and "ALEXIS" in str(response):
            print("   ✓ ALEXIS message found in response")
            return True
        elif success:
            self.log_test("Health Check - ALEXIS Message Content", False, "ALEXIS not found in response")
            return False
        return False

    def test_login(self):
        """Test 2: POST /api/auth/login creates/retrieves technician record"""
        test_data = {
            "name": "Test Technician",
            "email": f"test_{datetime.now().strftime('%H%M%S')}@alexis.local"
        }
        
        success, response = self.run_test(
            "Login - Create/Retrieve Technician",
            "POST",
            "api/auth/login",
            200,
            data=test_data
        )
        
        if success and 'technician_id' in response and 'token' in response:
            self.technician_id = response['technician_id']
            self.token = response['token']
            print(f"   ✓ Technician ID: {self.technician_id}")
            print(f"   ✓ Token received: {self.token[:20]}...")
            return True
        elif success:
            self.log_test("Login - Response Format", False, "Missing technician_id or token in response")
            return False
        return False

    def test_session_start(self):
        """Test 3: POST /api/session/start creates new diagnostic session with live=true"""
        if not self.technician_id:
            self.log_test("Session Start", False, "No technician_id available")
            return False
            
        test_data = {
            "technician_id": self.technician_id,
            "vehicle_year": "2023",
            "vehicle_make": "Toyota",
            "vehicle_model": "Camry"
        }
        
        success, response = self.run_test(
            "Session Start - Create Diagnostic Session",
            "POST",
            "api/session/start",
            200,
            data=test_data
        )
        
        if success and 'session_id' in response and response.get('live') == True:
            self.session_id = response['session_id']
            print(f"   ✓ Session ID: {self.session_id}")
            print(f"   ✓ Live status: {response['live']}")
            print(f"   ✓ Rules version: {response.get('rules_version', 'N/A')}")
            return True
        elif success:
            self.log_test("Session Start - Response Format", False, f"Missing session_id or live!=true. Response: {response}")
            return False
        return False

    def test_diagnostic_chat_contexts(self):
        """Test 4: POST /api/diagnostic/chat returns AI response with different contexts"""
        if not self.session_id:
            self.log_test("Diagnostic Chat", False, "No session_id available")
            return False

        contexts = [
            ("diagram_assistance", "What does a relay symbol look like?"),
            ("visual_inspection", "Check this connector installation"),
            ("symptom_audio_diagnostics", "Engine cranks but won't start")
        ]
        
        all_passed = True
        for context, test_message in contexts:
            test_data = {
                "session_id": self.session_id,
                "transcript": test_message,
                "context": context
            }
            
            success, response = self.run_test(
                f"Diagnostic Chat - {context}",
                "POST",
                "api/diagnostic/chat",
                200,
                data=test_data
            )
            
            if success and 'response' in response and len(response['response']) > 10:
                print(f"   ✓ AI response received for {context}: {response['response'][:100]}...")
            elif success:
                self.log_test(f"Diagnostic Chat - {context} Response", False, "Empty or invalid AI response")
                all_passed = False
            else:
                all_passed = False
        
        return all_passed

    def test_status_endpoints(self):
        """Test original status endpoints"""
        # Test status creation
        test_data = {"client_name": "Test Client"}
        success, response = self.run_test(
            "Status Creation",
            "POST",
            "api/status",
            200,
            data=test_data
        )
        
        if not success:
            return False
            
        # Test status retrieval
        success, response = self.run_test(
            "Status Retrieval",
            "GET",
            "api/status",
            200
        )
        
        return success

    def print_summary(self):
        """Print test summary"""
        print(f"\n{'='*60}")
        print(f"ALEXIS API TEST SUMMARY")
        print(f"{'='*60}")
        print(f"Tests Run: {self.tests_run}")
        print(f"Tests Passed: {self.tests_passed}")
        print(f"Tests Failed: {len(self.failed_tests)}")
        print(f"Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        if self.passed_tests:
            print(f"\n✅ PASSED TESTS:")
            for test in self.passed_tests:
                print(f"   • {test}")
        
        if self.failed_tests:
            print(f"\n❌ FAILED TESTS:")
            for failure in self.failed_tests:
                print(f"   • {failure['test']}: {failure['details']}")
        
        print(f"\n{'='*60}")
        return len(self.failed_tests) == 0

def main():
    print("🚀 Starting ALEXIS API Tests...")
    print(f"Timestamp: {datetime.now().isoformat()}")
    
    tester = AlexisAPITester()
    
    # Run all tests in sequence
    print("\n" + "="*60)
    print("RUNNING BACKEND API TESTS")
    print("="*60)
    
    # Test 1: Health check
    tester.test_health_check()
    
    # Test 2: Login
    if tester.test_login():
        # Test 3: Session start (requires login)
        if tester.test_session_start():
            # Test 4: Diagnostic chat (requires session)
            tester.test_diagnostic_chat_contexts()
    
    # Test 5: Status endpoints (independent)
    tester.test_status_endpoints()
    
    # Print final summary
    success = tester.print_summary()
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())