#!/usr/bin/env python3
"""
ALEXIS Diagram Overlay Generation Test
Tests the specific fix for diagram overlay generation in backend
"""

import requests
import sys
import json
from datetime import datetime
from typing import Dict, Any, Optional

class DiagramOverlayTester:
    def __init__(self, base_url: str = "https://autorepair-ai.preview.emergentagent.com"):
        self.base_url = base_url
        self.session_id = None
        self.technician_id = None
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
                    expected_status: int = 200) -> tuple[bool, Any]:
        """Make HTTP request and return success status and response data"""
        url = f"{self.base_url}/api/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=30)
            elif method == 'POST':
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
        # Login
        login_data = {
            "name": f"Overlay Test {datetime.now().strftime('%H%M%S')}",
            "email": f"overlay_test_{datetime.now().strftime('%H%M%S')}@alexis.local"
        }
        
        success, data = self.make_request('POST', 'auth/login', data=login_data)
        if not success:
            return False, f"Login failed: {data}"
        
        self.technician_id = data['technician_id']
        
        # Start session
        session_data = {
            "technician_id": self.technician_id,
            "vehicle_year": "2020",
            "vehicle_make": "Mercedes",
            "vehicle_model": "C300"
        }
        
        success, data = self.make_request('POST', 'session/start', data=session_data)
        if not success:
            return False, f"Session start failed: {data}"
        
        self.session_id = data['session_id']
        return True, "Session setup successful"

    def test_relay_overlay_generation(self):
        """Test overlay generation for relay-related queries"""
        print("\n🔍 Testing Relay Overlay Generation...")
        
        chat_data = {
            "session_id": self.session_id,
            "transcript": "Explain the relay in this diagram",
            "context": "diagram_assistance",
            "diagram_context": {
                "loaded": True,
                "filename": "test_diagram.pdf",
                "totalPages": 3,
                "currentPage": 1
            }
        }
        
        success, data = self.make_request('POST', 'diagnostic/chat', data=chat_data)
        
        if not success:
            self.log_test("Relay Overlay - API Call", False, str(data))
            return False
        
        # Check response structure
        if not isinstance(data, dict) or 'response' not in data:
            self.log_test("Relay Overlay - Response Structure", False, "Missing response field")
            return False
        
        # Check for overlayCommands
        if 'overlayCommands' not in data:
            self.log_test("Relay Overlay - Missing overlayCommands", False, "overlayCommands field missing")
            return False
        
        overlay_commands = data['overlayCommands']
        
        # Check that overlayCommands is not null when diagram is loaded
        if overlay_commands is None:
            self.log_test("Relay Overlay - Null Commands", False, "overlayCommands should not be null when diagram is loaded")
            return False
        
        # Check for expected overlay types for relay
        expected_types = ["HIGHLIGHT_BOX", "PULSE_DOT"]
        found_types = [cmd.get('type') for cmd in overlay_commands if isinstance(cmd, dict)]
        
        has_highlight = "HIGHLIGHT_BOX" in found_types
        has_pulse = "PULSE_DOT" in found_types
        
        if has_highlight and has_pulse:
            self.log_test("Relay Overlay - Correct Types", True, f"Found {found_types}")
        else:
            self.log_test("Relay Overlay - Missing Types", False, f"Expected HIGHLIGHT_BOX and PULSE_DOT, got {found_types}")
            return False
        
        # Check ALEXIS acknowledges the diagram
        response_text = data['response'].lower()
        acknowledges_diagram = any(phrase in response_text for phrase in [
            "diagram", "relay", "circuit", "wiring"
        ])
        
        if acknowledges_diagram:
            self.log_test("Relay Overlay - ALEXIS Acknowledgment", True, f"Response: {data['response'][:100]}...")
        else:
            self.log_test("Relay Overlay - ALEXIS Acknowledgment", False, f"Response doesn't acknowledge diagram: {data['response'][:100]}...")
        
        return True

    def test_wire_trace_overlay_generation(self):
        """Test overlay generation for wire tracing queries"""
        print("\n🔍 Testing Wire Trace Overlay Generation...")
        
        chat_data = {
            "session_id": self.session_id,
            "transcript": "Where do these wires go?",
            "context": "diagram_assistance",
            "diagram_context": {
                "loaded": True,
                "filename": "test_diagram.pdf",
                "totalPages": 3,
                "currentPage": 1
            }
        }
        
        success, data = self.make_request('POST', 'diagnostic/chat', data=chat_data)
        
        if not success:
            self.log_test("Wire Trace - API Call", False, str(data))
            return False
        
        # Check for overlayCommands
        overlay_commands = data.get('overlayCommands')
        if overlay_commands is None:
            self.log_test("Wire Trace - Null Commands", False, "overlayCommands should not be null when diagram is loaded")
            return False
        
        # Check for TRACE_PATH overlay command
        found_types = [cmd.get('type') for cmd in overlay_commands if isinstance(cmd, dict)]
        
        if "TRACE_PATH" in found_types:
            self.log_test("Wire Trace - TRACE_PATH Found", True, f"Found overlay types: {found_types}")
        else:
            self.log_test("Wire Trace - TRACE_PATH Missing", False, f"Expected TRACE_PATH, got {found_types}")
            return False
        
        # Check for pathPoints in TRACE_PATH command
        trace_cmd = next((cmd for cmd in overlay_commands if cmd.get('type') == 'TRACE_PATH'), None)
        if trace_cmd and 'pathPoints' in trace_cmd:
            self.log_test("Wire Trace - PathPoints Present", True, f"PathPoints: {len(trace_cmd['pathPoints'])} points")
        else:
            self.log_test("Wire Trace - PathPoints Missing", False, "TRACE_PATH command missing pathPoints")
        
        return True

    def test_no_diagram_loaded(self):
        """Test that overlayCommands is null when no diagram is loaded"""
        print("\n🔍 Testing No Diagram Loaded Scenario...")
        
        chat_data = {
            "session_id": self.session_id,
            "transcript": "Explain the relay",
            "context": "diagram_assistance",
            "diagram_context": {
                "loaded": False
            }
        }
        
        success, data = self.make_request('POST', 'diagnostic/chat', data=chat_data)
        
        if not success:
            self.log_test("No Diagram - API Call", False, str(data))
            return False
        
        # When no diagram is loaded, overlayCommands should be null or empty
        overlay_commands = data.get('overlayCommands')
        
        if overlay_commands is None or overlay_commands == []:
            self.log_test("No Diagram - Null/Empty Commands", True, "overlayCommands correctly null/empty when no diagram")
        else:
            self.log_test("No Diagram - Unexpected Commands", False, f"Expected null/empty overlayCommands, got {overlay_commands}")
        
        # ALEXIS should ask to upload diagram
        response_text = data['response'].lower()
        asks_upload = any(phrase in response_text for phrase in [
            "upload", "+ button", "load a diagram", "please upload"
        ])
        
        if asks_upload:
            self.log_test("No Diagram - Upload Request", True, f"ALEXIS asks for upload: {data['response'][:100]}...")
        else:
            self.log_test("No Diagram - Upload Request", False, f"ALEXIS should ask for upload: {data['response'][:100]}...")
        
        return True

    def test_multiple_overlay_keywords(self):
        """Test overlay generation with multiple keywords"""
        print("\n🔍 Testing Multiple Overlay Keywords...")
        
        chat_data = {
            "session_id": self.session_id,
            "transcript": "Show me the relay coil, the ground connection, and trace the wire path to the ECU module",
            "context": "diagram_assistance",
            "diagram_context": {
                "loaded": True,
                "filename": "complex_diagram.pdf",
                "totalPages": 5,
                "currentPage": 2
            }
        }
        
        success, data = self.make_request('POST', 'diagnostic/chat', data=chat_data)
        
        if not success:
            self.log_test("Multiple Keywords - API Call", False, str(data))
            return False
        
        overlay_commands = data.get('overlayCommands')
        if overlay_commands is None:
            self.log_test("Multiple Keywords - Null Commands", False, "overlayCommands should not be null")
            return False
        
        found_types = [cmd.get('type') for cmd in overlay_commands if isinstance(cmd, dict)]
        
        # Should have multiple overlay types for different keywords
        expected_types = ["HIGHLIGHT_BOX", "PULSE_DOT", "ARROW_POINTER", "TRACE_PATH"]
        found_expected = [t for t in expected_types if t in found_types]
        
        if len(found_expected) >= 3:  # Should have at least 3 different overlay types
            self.log_test("Multiple Keywords - Diverse Overlays", True, f"Found {len(found_expected)} overlay types: {found_expected}")
        else:
            self.log_test("Multiple Keywords - Limited Overlays", False, f"Expected multiple overlay types, got {found_types}")
        
        return True

    def test_overlay_properties(self):
        """Test that overlay commands have required properties"""
        print("\n🔍 Testing Overlay Command Properties...")
        
        chat_data = {
            "session_id": self.session_id,
            "transcript": "Show me the fuse and connector pins",
            "context": "diagram_assistance",
            "diagram_context": {
                "loaded": True,
                "filename": "test_diagram.pdf",
                "totalPages": 3,
                "currentPage": 1
            }
        }
        
        success, data = self.make_request('POST', 'diagnostic/chat', data=chat_data)
        
        if not success:
            self.log_test("Overlay Properties - API Call", False, str(data))
            return False
        
        overlay_commands = data.get('overlayCommands', [])
        
        all_valid = True
        for i, cmd in enumerate(overlay_commands):
            if not isinstance(cmd, dict):
                self.log_test(f"Overlay Properties - Command {i} Type", False, "Command is not a dict")
                all_valid = False
                continue
            
            # Check required properties
            if 'type' not in cmd:
                self.log_test(f"Overlay Properties - Command {i} Type Field", False, "Missing 'type' field")
                all_valid = False
            
            if 'page' not in cmd:
                self.log_test(f"Overlay Properties - Command {i} Page Field", False, "Missing 'page' field")
                all_valid = False
            
            # Check type-specific properties
            cmd_type = cmd.get('type')
            if cmd_type in ['HIGHLIGHT_BOX']:
                if 'bounds' not in cmd:
                    self.log_test(f"Overlay Properties - Command {i} Bounds", False, f"{cmd_type} missing 'bounds'")
                    all_valid = False
            elif cmd_type in ['PULSE_DOT', 'ARROW_POINTER']:
                if 'anchor' not in cmd:
                    self.log_test(f"Overlay Properties - Command {i} Anchor", False, f"{cmd_type} missing 'anchor'")
                    all_valid = False
            elif cmd_type == 'TRACE_PATH':
                if 'pathPoints' not in cmd:
                    self.log_test(f"Overlay Properties - Command {i} PathPoints", False, "TRACE_PATH missing 'pathPoints'")
                    all_valid = False
        
        if all_valid:
            self.log_test("Overlay Properties - All Valid", True, f"All {len(overlay_commands)} commands have required properties")
        
        return all_valid

    def run_all_tests(self):
        """Run all diagram overlay tests"""
        print("🚀 Starting ALEXIS Diagram Overlay Generation Tests")
        print(f"📡 Testing against: {self.base_url}")
        print("=" * 60)

        # Setup session
        setup_success, setup_msg = self.setup_session()
        if not setup_success:
            print(f"❌ Setup failed: {setup_msg}")
            return 0, 1, [{"test": "Setup", "details": setup_msg}]

        print(f"✅ Session setup successful: {self.session_id}")

        # Run overlay tests
        self.test_relay_overlay_generation()
        self.test_wire_trace_overlay_generation()
        self.test_no_diagram_loaded()
        self.test_multiple_overlay_keywords()
        self.test_overlay_properties()

        # Print summary
        print("\n" + "=" * 60)
        print(f"📊 Test Results: {self.tests_passed}/{self.tests_run} passed")
        
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
    tester = DiagramOverlayTester()
    passed, total, failures = tester.run_all_tests()
    
    # Return appropriate exit code
    if passed == total:
        print("\n🎉 All diagram overlay tests passed!")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())