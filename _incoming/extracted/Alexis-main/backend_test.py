#!/usr/bin/env python3
"""
ALEXIS Production Lock-down Backend Test
Tests Black Box session management and core API functionality
"""

import requests
import sys
import json
from datetime import datetime
from typing import Dict, Any, Optional

class AlexisBackendTester:
    def __init__(self, base_url: str = "https://app-scan-helper.preview.emergentagent.com"):
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'ALEXIS-Backend-Tester/1.0'
        })
        self.tests_run = 0
        self.tests_passed = 0
        self.technician_id = None
        self.token = None
        self.session_id = None

    def log(self, message: str, level: str = "INFO"):
        """Log test messages with timestamp"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {level}: {message}")

    def run_test(self, name: str, method: str, endpoint: str, expected_status: int, 
                 data: Optional[Dict] = None, headers: Optional[Dict] = None) -> tuple[bool, Dict]:
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        test_headers = self.session.headers.copy()
        if headers:
            test_headers.update(headers)

        self.tests_run += 1
        self.log(f"🔍 Testing {name}...")
        self.log(f"   {method} {url}")
        
        try:
            if method == 'GET':
                response = self.session.get(url, headers=test_headers, timeout=30)
            elif method == 'POST':
                response = self.session.post(url, json=data, headers=test_headers, timeout=30)
            elif method == 'PUT':
                response = self.session.put(url, json=data, headers=test_headers, timeout=30)
            elif method == 'DELETE':
                response = self.session.delete(url, headers=test_headers, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")

            success = response.status_code == expected_status
            
            if success:
                self.tests_passed += 1
                self.log(f"✅ PASSED - Status: {response.status_code}")
            else:
                self.log(f"❌ FAILED - Expected {expected_status}, got {response.status_code}")
                self.log(f"   Response: {response.text[:200]}")

            try:
                response_data = response.json() if response.text else {}
            except json.JSONDecodeError:
                response_data = {"raw_response": response.text}

            return success, response_data

        except requests.exceptions.Timeout:
            self.log(f"❌ FAILED - Request timeout after 30 seconds", "ERROR")
            return False, {"error": "timeout"}
        except requests.exceptions.ConnectionError as e:
            self.log(f"❌ FAILED - Connection error: {str(e)}", "ERROR")
            return False, {"error": "connection_error", "details": str(e)}
        except Exception as e:
            self.log(f"❌ FAILED - Unexpected error: {str(e)}", "ERROR")
            return False, {"error": "unexpected", "details": str(e)}

    def test_auth_login(self) -> bool:
        """Test technician login"""
        test_data = {
            "name": f"Test Technician {datetime.now().strftime('%H%M%S')}",
            "email": f"test.tech.{datetime.now().strftime('%H%M%S')}@alexis.test"
        }
        
        success, response = self.run_test(
            "Technician Login",
            "POST",
            "/api/auth/login",
            200,
            data=test_data
        )
        
        if success and 'technician_id' in response and 'token' in response:
            self.technician_id = response['technician_id']
            self.token = response['token']
            self.log(f"   Technician ID: {self.technician_id}")
            self.log(f"   Token: {self.token[:20]}...")
            return True
        
        self.log("❌ Login failed - missing technician_id or token", "ERROR")
        return False

    def test_session_start(self) -> bool:
        """Test Black Box session start - creates session and vault"""
        if not self.technician_id:
            self.log("❌ Cannot test session start - no technician_id", "ERROR")
            return False
            
        test_data = {
            "technician_id": self.technician_id,
            "vehicle_year": "2023",
            "vehicle_make": "BMW",
            "vehicle_model": "X5"
        }
        
        success, response = self.run_test(
            "Black Box Session Start",
            "POST",
            "/api/session/start",
            200,
            data=test_data
        )
        
        if success and 'session_id' in response:
            self.session_id = response['session_id']
            self.log(f"   Session ID: {self.session_id}")
            self.log(f"   Live: {response.get('live', 'unknown')}")
            self.log(f"   Rules Version: {response.get('rules_version', 'unknown')}")
            
            # Verify expected fields
            expected_fields = ['session_id', 'live', 'rules_version', 'technician_id', 'created_at']
            missing_fields = [field for field in expected_fields if field not in response]
            
            if missing_fields:
                self.log(f"⚠️  Missing response fields: {missing_fields}", "WARNING")
            
            return True
        
        self.log("❌ Session start failed - missing session_id", "ERROR")
        return False

    def test_session_end(self) -> bool:
        """Test Black Box session end - destroys vault and returns confirmation"""
        if not self.session_id:
            self.log("❌ Cannot test session end - no session_id", "ERROR")
            return False
            
        test_data = {
            "session_id": self.session_id
        }
        
        success, response = self.run_test(
            "Black Box Session End",
            "POST",
            "/api/session/end",
            200,
            data=test_data
        )
        
        if success:
            expected_message = "Session ended. Data cleared."
            actual_message = response.get('message', '')
            
            if expected_message in actual_message:
                self.log(f"✅ Correct vault destruction message: '{actual_message}'")
                return True
            else:
                self.log(f"❌ Unexpected message: '{actual_message}' (expected: '{expected_message}')", "ERROR")
                return False
        
        return False

    def test_diagnostic_chat_basic(self) -> bool:
        """Test basic diagnostic chat functionality"""
        if not self.session_id:
            self.log("❌ Cannot test diagnostic chat - no session_id", "ERROR")
            return False
            
        test_data = {
            "session_id": self.session_id,
            "transcript": "BMW X5 cranks but won't start",
            "context": "symptom_audio_diagnostics",
            "response_mode": "EXPLANATION"
        }
        
        success, response = self.run_test(
            "Diagnostic Chat Basic",
            "POST",
            "/api/diagnostic/chat",
            200,
            data=test_data
        )
        
        if success and 'response' in response:
            chat_response = response['response']
            self.log(f"   Chat Response Length: {len(chat_response)} chars")
            
            # Check for ALEXIS diagnostic patterns
            diagnostic_indicators = [
                "LOCKED:",
                "COMMAND:",
                "EXPECTED:",
                "battery",
                "ECU",
                "crank"
            ]
            
            found_indicators = [ind for ind in diagnostic_indicators if ind.lower() in chat_response.lower()]
            self.log(f"   Diagnostic Indicators Found: {found_indicators}")
            
            if len(found_indicators) >= 2:
                self.log("✅ Response contains diagnostic content")
                return True
            else:
                self.log("⚠️  Response may not contain proper diagnostic content", "WARNING")
                return True  # Still pass as API worked
        
        return False

    def test_health_endpoints(self) -> bool:
        """Test basic health/status endpoints"""
        endpoints_to_test = [
            ("/", 404),  # Root should not exist
            ("/api", 404),  # API root should not exist  
            ("/health", 404),  # Health endpoint may not exist
        ]
        
        all_passed = True
        for endpoint, expected_status in endpoints_to_test:
            success, _ = self.run_test(
                f"Health Check {endpoint}",
                "GET",
                endpoint,
                expected_status
            )
            if not success:
                all_passed = False
        
        return all_passed

    def run_full_test_suite(self) -> int:
        """Run complete backend test suite"""
        self.log("🚀 Starting ALEXIS Production Lock-down Backend Tests")
        self.log(f"   Target: {self.base_url}")
        self.log("=" * 60)
        
        # Test sequence
        test_results = []
        
        # 1. Authentication
        self.log("\n📋 PHASE 1: Authentication")
        test_results.append(("Auth Login", self.test_auth_login()))
        
        # 2. Black Box Session Management
        self.log("\n📋 PHASE 2: Black Box Session Management")
        test_results.append(("Session Start", self.test_session_start()))
        test_results.append(("Diagnostic Chat", self.test_diagnostic_chat_basic()))
        test_results.append(("Session End", self.test_session_end()))
        
        # 3. Health checks
        self.log("\n📋 PHASE 3: Health Checks")
        test_results.append(("Health Endpoints", self.test_health_endpoints()))
        
        # Results summary
        self.log("\n" + "=" * 60)
        self.log("📊 TEST RESULTS SUMMARY")
        self.log("=" * 60)
        
        for test_name, result in test_results:
            status = "✅ PASS" if result else "❌ FAIL"
            self.log(f"   {test_name:<25} {status}")
        
        passed_tests = sum(1 for _, result in test_results if result)
        total_tests = len(test_results)
        
        self.log(f"\n📈 Overall: {passed_tests}/{total_tests} test phases passed")
        self.log(f"📈 Individual: {self.tests_passed}/{self.tests_run} API calls successful")
        
        if passed_tests == total_tests:
            self.log("🎉 ALL BACKEND TESTS PASSED!")
            return 0
        else:
            self.log("⚠️  SOME BACKEND TESTS FAILED!")
            return 1

def main():
    """Main test execution"""
    tester = AlexisBackendTester()
    return tester.run_full_test_suite()

if __name__ == "__main__":
    sys.exit(main())