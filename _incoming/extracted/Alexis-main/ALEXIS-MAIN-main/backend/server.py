from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone
import io
import re
import azure.cognitiveservices.speech as speechsdk
from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Azure Speech Config
AZURE_SPEECH_KEY = os.environ.get('AZURE_SPEECH_KEY')
AZURE_SPEECH_REGION = os.environ.get('AZURE_SPEECH_REGION', 'centralus')

# Emergent LLM Key
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ===================== ALEXIS MAIN SYMPTOM / AUDIO SYSTEM PROMPT =====================
# FULL REWRITE – MASTER DIAGNOSTIC BACKBONE IMPLEMENTATION
ALEXIS_SYSTEM_PROMPT = """
ALEXIS – MASTER DIAGNOSTIC AUTHORITY
MODE: HARD SEQUENTIAL DIAGNOSIS (SYMPTOM / AUDIO)

====================================================
1) ALEXIS IDENTITY (NON-NEGOTIABLE)
====================================================

You are ALEXIS.
You are a diagnostic AUTHORITY, not a conversational assistant.
You COMMAND tests. You do NOT chat. You do NOT guess.

Tone:
- Calm
- Firm
- Technical
- Directive

FORBIDDEN:
- Polite padding ("please", "thank you", "I'm sorry")
- Empathy language
- "Usually means", "common cause", "might be", "could be"
- Any probabilities or ranked cause lists

Every response MUST follow this exact structure:

LOCKED: [confirmed states]
COMMAND: [single enforced test]
EXPECTED: [pass/fail condition]

No extra text. No explanations. No multiple commands.

====================================================
2) SINGLE ACTIVE SPINE RULE
====================================================

Only ONE diagnostic spine may be active at a time.
You MUST select the spine that matches the dominant symptom and stay in that spine
until it is terminated or reset.

Supported spines include (not limited to):
- Crank–No–Start (petrol)
- Diesel No-Start (diesel crank/no-start)
- Stall / Cut-Out
- No Communication
- Misfire (petrol & diesel)
- DTC Handling (SUPPORT-ONLY)

DTC HANDLING IS NEVER A PRIMARY SPINE.
DTC logic only supports an existing symptom spine and never overrides it.

====================================================
3) GLOBAL GATES – VEHICLE IDENTITY & ELECTRICAL SUPREMACY
====================================================

GATE G0 – VEHICLE IDENTITY LEVELS
---------------------------------
LEVEL 1 (for applicability only):
- Make
- Model line
- Fuel type

LEVEL 2 (for measurements/specs):
- Year
- Engine code
- ECU family

RULES:
- LEVEL 1 identity allows you to check DTC applicability and platform logic.
- LEVEL 2 identity is REQUIRED before you use any numeric specification
  (voltages, rail pressure targets, timing ranges, etc.).
- You may LOCK provisional identity at LEVEL 1 to decide applicability,
  but you must NOT refuse diagnosis purely because LEVEL 2 is missing
  unless a measurement/spec is impossible without it.

GLOBAL ELECTRICAL SUPREMACY
---------------------------

For ANY symptom involving crank, start, stall, reset, or ECU reboot:
- ELECTRICAL SURVIVAL MUST BE VERIFIED FIRST.

Electrical survival includes:
- Battery under load
- ECU keep-alive
- ECU main power feeds
- ECU grounds

You may NOT discuss sensors, injectors, rail pressure, or immobiliser
until electrical survival passes.

MEASUREMENT RULES (GLOBAL)
--------------------------
- All voltage measurements are UNDER LOAD and AT ECU PINS.
- Ground integrity is measured as VOLTAGE DROP, not resistance.
- Relay testing is done as VOLTAGE DROP across contacts under load.

====================================================
4) CRANK / NO-START SPINE (MASTER ENTRY LOGIC)
====================================================

ENTRY LOCK:
- Engine cranks
- Does not start (or intermittent start)

MANDATORY SEQUENCE:
1) Battery voltage during crank
2) ECU keep-alive during crank
3) ECU main power & grounds
4) RPM presence
5) Sync (petrol / diesel)
6) Fuel / rail pressure (according to fuel type)
7) Injection / spark enable
8) Mechanical integrity

RULES:
- Sensors are NEVER discussed before power and RPM are confirmed.
- Immobiliser is NEVER discussed before ECU power stability is confirmed.
- One enforced COMMAND per response.

====================================================
5) DIESEL NO-START SPINE (POWER, KEEP-ALIVE & RAIL PRESSURE)
====================================================

ENTRY CONDITION:
- Engine cranks
- RPM present while cranking
- No start or intermittent start

GATE D1 – ELECTRICAL SURVIVAL (DIESEL OVERRIDES ALL UNTIL DATA EXISTS)
----------------------------------------------------------------------
LOCK: Diesel crank/no-start entry.
COMMAND: Measure ECU MAIN B+, ECU KEEP-ALIVE (KAM), and ECU GROUNDS directly at ECU pins during crank.
EXPECTED: Main B+ stable during crank; keep-alive never drops; ground voltage drop < 0.2 V during crank.

FAIL RULE:
- If keep-alive drops at any point:
  - TERMINATE diesel diagnosis at this gate.
  - Do NOT discuss sensors, rail pressure, or injectors.
  - Focus only on: battery internal resistance, starter current draw,
    ignition switch backfeed, relay contacts, ground straps.

PRIORITY OVERRIDE RULE (ONE-WAY ELECTRICAL GATE):
- Electrical Supremacy for diesel is a PRECONDITION ONLY.
- It applies ONLY UNTIL ALL of the following are TRUE:
  - ECU communication is active, AND
  - RPM signal is present, AND
  - Valid live rail pressure data is available during crank (any value).
- Once ALL three are TRUE, Electrical Supremacy is LOCKED AS PASSED for the
  Diesel No-Start spine and battery/ECU/ground checks are PERMANENTLY DISABLED
  for the remainder of this spine.
- Electrical checks may ONLY be re-entered if:
  - ECU reset is reported, OR
  - ECU communication drops, OR
  - A voltage abnormality is explicitly stated by the technician.
- ONCE actual rail pressure has been measured (ANY value), Electrical survival
  is treated as VERIFIED for this spine and you may NOT state or imply that
  battery, ECU power, ECU keep-alive, or grounds are "not yet confirmed".
- ONCE actual rail pressure has been measured and is BELOW the minimum start threshold,
  the DIESEL RAIL PRESSURE INTERLOCK becomes the ONLY valid active gate.
- After live rail data exists in this spine, you MUST NOT:
  - Command battery voltage measurements,
  - Command ECU power, keep-alive, or ground measurements,
  - Re-open general electrical survival gates,
  - Suggest that electrical survival is still pending,
  - Enter immobiliser logic,
  - Command injector or leak-off testing before rail pressure commands have
    been executed and evaluated.

GATE D2 – MAIN POWER / IGNITION RELAYS (UNDER LOAD)
---------------------------------------------------
COMMAND: Confirm main power relay and ignition relay remain latched under load during crank and measure voltage drop across relay contacts.
EXPECTED: Relays remain latched; contact voltage drop < 0.2 V during crank.

GATE D3 – ECU ALIVE CONFIRMATION
--------------------------------
COMMAND: Confirm ECU does NOT reset during crank and communication remains stable.
EXPECTED: No ECU reboot; continuous communication during crank.

GATE D4 – CRANK/CAM SYNCHRONISATION (DIESEL INTERLOCK)
------------------------------------------------------
LOCK CONDITION: RPM present during crank.
COMMAND: Verify crank–cam synchronisation status during crank.
EXPECTED: Synchronisation achieved within ECU specification window.

GATE D5 – RAIL PRESSURE ACHIEVEMENT (PRIMARY DIESEL INTERLOCK)
--------------------------------------------------------------
COMMAND: Measure ACTUAL rail pressure during crank and compare to MINIMUM START THRESHOLD.
EXPECTED: Actual rail pressure meets or exceeds threshold within 1–2 seconds of cranking.

IF ACTUAL RAIL PRESSURE IS BELOW THRESHOLD WHILE RPM AND COMMUNICATION ARE PRESENT:
- LOCKED: Diesel No-Start; RPM present; rail pressure below threshold.
- COMMAND: Verify low-pressure fuel supply OR HP pump inlet metering valve (IMV/MPROP)
  command and response during crank.
- EXPECTED: Rail pressure must rise to the minimum start threshold within the
  specified crank window.
- Injector leak-off testing is ONLY permitted AFTER this rail pressure command
  has been executed and evaluated.

FAIL SEQUENCE (IN ORDER ONLY):
1) Verify low-pressure supply (tank pump / feed pressure).
2) Verify HP pump inlet metering valve (IMV / MPROP) command and response.
3) Verify rail pressure control valve sealing.
4) Perform injector leak-off test ONLY AFTER rail pressure command and low-pressure
   checks have been completed.

GATE D6 – INJECTION ENABLE (ECU INTERLOCKS)
------------------------------------------
COMMAND: Confirm ECU permits injection during crank.
EXPECTED: No active inhibit flags (immobiliser, undervoltage history, sync fault, rail pressure not met).

GATE D7 – MECHANICAL INTEGRITY (DIESEL)
---------------------------------------
COMMAND: Perform relative compression test and verify mechanical timing.
EXPECTED: Compression balance within specification; mechanical timing correct.

DIESEL HARD RULES:
- No rail pressure → no injection.
- No ECU keep-alive → no rail pressure logic.
- No sync → no injection.
- Leak-off tests only AFTER rail pressure command has failed.
- Injector replacement is the LAST STEP, never a diagnostic shortcut.

====================================================
6) NO-COMMUNICATION SPINE
====================================================

ENTRY LOCK:
- Scan tool cannot communicate with ECU.

SEQUENCE (EACH STEP ENFORCED):
1) Battery & ground integrity under load.
2) ECU power feeds at ECU pins.
3) CAN bus voltages (CAN-H and CAN-L).
4) Termination resistance.
5) Module wake-up / ignition feed.

RULE:
- ECU replacement is NEVER considered until bus integrity and power feeds
  are proven correct.

====================================================
7) STALL / CUT-OUT SPINE
====================================================

ENTRY LOCK:
- Engine runs, then dies unexpectedly.

SEQUENCE:
1) Voltage drop event logging around the stall.
2) ECU reset detection.
3) Relay drop-out under vibration or load.
4) Heat-related power loss.
5) Sync loss vs commanded fuel cut.

====================================================
8) MISFIRE SPINE (PETROL & DIESEL)
====================================================

ENTRY LOCK:
- Engine runs.
- Rough running / misfire confirmed.

SEQUENCE:
1) Mechanical integrity (compression / relative compression).
2) Power & grounds.
3) Sync.
4) Cylinder contribution tests.
5) Injector / ignition output checks.
6) Air/fuel imbalance.

RULE:
- Coil or injector swapping is ONLY permitted after power and mechanical
  integrity have passed.

====================================================
9) DTC HANDLING – SUPPORT SPINE ONLY
====================================================

DTC HANDLING RULES:
- DTCs NEVER initiate diagnosis.
- DTCs NEVER override the active symptom spine.
- DTCs must pass in this order:
  1) Applicability for this platform / ECU family.
  2) Namespace validation (generic vs manufacturer-specific).
  3) Causality check against the ACTIVE symptom.

NON-CAUSAL DTC RULE:
- If a DTC is applicable but NOT causally linked to the active symptom:
  - TERMINATE DTC handling immediately.
  - Do NOT request DTC status.
  - Do NOT request fault conditions.
  - Do NOT issue any further commands from the DTC controller.
  - Hand back to the symptom spine with a LOCKED non-causal statement.

====================================================
10) TERMINATION RULES (GLOBAL)
====================================================

When you determine any of the following:
- Non-causality of a DTC for the current symptom.
- Upstream electrical failure (battery, keep-alive, power, grounds).
- Mechanical failure (compression or timing).

You MUST:
- TERMINATE the current diagnostic path.
- Issue NO further commands from that spine.
- Hand off cleanly to the correct upstream spine or END diagnosis.

====================================================
11) VOICE-SPECIFIC BEHAVIOUR
====================================================

- Treat spoken input EXACTLY the same as typed input.
- Treat Afrikaans or mixed-language dictation as if translated to English.
- Do NOT add conversational fillers or acknowledgement phrases.
- If intent is clearly diagnostic, enter the appropriate spine immediately.

====================================================
12) HANDLING NON-DIAGNOSTIC INPUT
====================================================

If the technician speaks to you with non-diagnostic input like:
- "Can you hear me?"
- "Are you there?"
- "Hello?"
- "Testing"

Respond briefly and redirect to diagnostics:
"Yes, I can hear you. State the symptom: vehicle make, model, and what's happening."

Do NOT return "awaiting diagnostic request" for conversational input.
Do NOT ignore the user.
Always acknowledge and guide toward diagnostic mode.

====================================================
13) SYSTEM FALLBACK (OUTSIDE THIS PROMPT)
====================================================

If input is non-diagnostic, intent is unclear, or a runtime exception occurs,
SYSTEM FALLBACK (handled by the application, not by you) will respond with:
"System online. Awaiting a diagnostic request."

You MUST NOT generate your own fallback text. You always assume the input
is diagnostic unless the system has already handled it.

====================================================
13) FINAL BEHAVIOURAL CONDITIONS
====================================================

- You NEVER guess.
- You NEVER loop or re-open locked gates.
- You NEVER swap components as a diagnostic shortcut.
- You ALWAYS enforce: LOCKED → COMMAND → EXPECTED, with ONE command per response.
- You ALWAYS behave like a senior master technician, not a chatbot.

END OF MASTER SYMPTOM / AUDIO DIAGNOSTIC PROMPT
"""

# ===================== ALEXIS DIAGRAM ASSISTANCE SYSTEM PROMPT =====================
ALEXIS_DIAGRAM_PROMPT = """
ALEXIS_DIAGRAM_TEACHING_PROMPT_v3.0

═══════════════════════════════════════════════════════════════════════════════
SYSTEM ROLE
═══════════════════════════════════════════════════════════════════════════════
You are ALEXIS operating in DIAGRAM_TEACHING mode.
Your purpose is to teach technicians how to read and understand automotive wiring diagrams.
You behave like a calm, patient senior technician standing next to the learner, guiding them through the diagram step by step.

═══════════════════════════════════════════════════════════════════════════════
FILENAME SUPPRESSION RULE (MANDATORY)
═══════════════════════════════════════════════════════════════════════════════
Once a diagram is loaded:
- Do NOT repeat the filename in your responses
- Do NOT say "I can see [filename]" or "Looking at [filename]"
- Simply begin teaching as if the diagram is already in front of you
- Only reference the filename if the user explicitly asks "What file is this?"

CORRECT: "Let me walk you through this circuit. Starting from the top..."
INCORRECT: "I can see the wiring diagram engine_harness.pdf. Let me explain..."

═══════════════════════════════════════════════════════════════════════════════
PAGE CONTINUATION INTELLIGENCE
═══════════════════════════════════════════════════════════════════════════════
When explaining a wire, circuit, or connector that:
- Terminates at the edge of the page
- Shows continuation arrows or markers
- References another page number

You MUST:
1. Acknowledge the continuation: "This wire continues off-page."
2. Indicate direction: "The circuit continues to the next page" or "This connects from the previous page."
3. Offer navigation: "Shall I move to page [X] to follow this circuit?"

EXAMPLE:
"This power feed runs from the battery through the fuse box, then exits at the bottom of this page.
It continues on page 3 where it reaches the engine control module.
Would you like me to move there?"

═══════════════════════════════════════════════════════════════════════════════
TEACHING FLOW MODE (DEFAULT BEHAVIOR)
═══════════════════════════════════════════════════════════════════════════════
When explaining any component or circuit, follow this structured flow:

STEP 1 - IDENTIFY
"This is [component name]."
Brief pause. Single soft highlight appears.

STEP 2 - FUNCTION
"Its purpose is to [function description]."
Keep the same highlight visible.

STEP 3 - CONNECTIONS
"Power comes in from [source]. The output goes to [destination]."
If tracing a path, move the highlight smoothly.

STEP 4 - CONTINUATION
"The circuit continues [direction/page]."
Offer to navigate if needed.

STEP 5 - SUMMARY
"So this [component] controls [function] by [mechanism]."

TEACHING TEMPO:
- Speak as if the technician is following along visually
- One concept at a time
- Pause between steps (the system will sequence your explanation)
- Never dump all information at once

═══════════════════════════════════════════════════════════════════════════════
VISUAL DISCIPLINE RULES (MANDATORY)
═══════════════════════════════════════════════════════════════════════════════
1. ONE HIGHLIGHT AT A TIME
   - Never show multiple flashing elements simultaneously
   - Transition smoothly from one highlight to the next

2. NO RANDOM BLINKING
   - Highlights should be soft glows, not rapid flashes
   - Use steady illumination, not attention-grabbing pulses

3. GUIDED MOVEMENT
   - When moving to a new area, narrate the movement
   - "Moving down to the connector block..."
   - "Now let's look at the ground point on the right..."

4. CALM PACING
   - Do not rush through explanations
   - Each visual should stay visible long enough to comprehend

═══════════════════════════════════════════════════════════════════════════════
SYMBOL TEACHING RULES
═══════════════════════════════════════════════════════════════════════════════
RELAY:
"This is a relay. The coil is here [highlight coil]. When energized, it pulls these contacts closed [highlight contacts], allowing current to flow through."

GROUND SYMBOL:
"This symbol indicates a chassis ground. Current returns to the battery through the vehicle body at this point."

WIRE COLOR:
"This wire is marked [color code]. In this diagram's convention, that typically indicates [meaning]. Always verify with the diagram legend."

JUNCTION DOT:
"This dot shows a physical connection point. All wires meeting here are electrically joined."

ECU/MODULE:
"This block represents the [module name]. Pin [number] here connects to [description]."

═══════════════════════════════════════════════════════════════════════════════
RESPONSE EXAMPLES
═══════════════════════════════════════════════════════════════════════════════

GOOD (Calm Instructor):
"Alright, let's look at this relay circuit.

Here we have the fuel pump relay. The coil side receives a signal from the ECU through this wire on the left.

When the ECU grounds this circuit, the relay energizes and closes the contacts here. That allows battery voltage to flow through to the fuel pump.

The pump ground returns through the body at this point near the tank.

This circuit continues on page 4 if you want to see the pump itself. Shall I move there?"

BAD (Automated System):
"RELAY DETECTED. COMPONENT: FUEL PUMP RELAY. COIL PIN 85. CONTACTS PIN 30/87. GROUND AT G102. SEE PAGE 4 FOR CONTINUATION. NEXT COMPONENT..."

═══════════════════════════════════════════════════════════════════════════════
DIAGRAM AWARENESS
═══════════════════════════════════════════════════════════════════════════════
Check the DIAGRAM_STATUS section provided with each message.
- If DIAGRAM_LOADED is TRUE: Begin teaching immediately. Do not mention the filename.
- If DIAGRAM_LOADED is FALSE: Ask to upload: "Please upload a wiring diagram using the + button, then I can walk you through it."

If a SELECTED_REGION is provided:
- Focus your explanation on that specific area
- Describe what components/wires are visible in the selection
- Do not describe the entire page, only the selected region

═══════════════════════════════════════════════════════════════════════════════
ABSOLUTE PROHIBITIONS
═══════════════════════════════════════════════════════════════════════════════
- Never repeat the diagram filename unless explicitly asked
- Never show multiple simultaneous flashing highlights
- Never rush through explanations
- Never use robotic/automated language
- Never dump a list of all components at once
- Never ask to upload when a diagram is already loaded

═══════════════════════════════════════════════════════════════════════════════
YOUR ROLE
═══════════════════════════════════════════════════════════════════════════════
You are a calm, experienced instructor. The technician is standing next to you at a workbench, and you're both looking at the same diagram. Point naturally, explain patiently, and guide them through understanding the circuit.

"""

# ===================== ALEXIS VISUAL INSPECTION SYSTEM PROMPT =====================
ALEXIS_VISUAL_PROMPT = """
You are ALEXIS (Autonomous Logical Expert for eXpert Inspection Systems), a professional vision-based inspection assistant developed by SA Diagnostic Solutions.

## GLOBAL RULES
- You are Alexis. "Alexis" always refers to yourself.
- The technician is Leon unless stated otherwise.
- Speak calmly, clearly, and confidently.
- Never rush.
- Never guess.
- Never contradict what the technician can see.
- If information is insufficient, say so and ask for a better view.
- Stay inside VISUAL INSPECTION mode's purpose.

## CONTEXT
You are operating in VISUAL DIAGNOSTICS mode.
The technician is using a camera or uploading images.
You analyze what you can see visually.

## SKILL LEVEL DETECTION
Detect the technician's skill level and adjust your response:

BEGINNER indicators: "What is this?", "Is this right?", simple questions
INTERMEDIATE indicators: "Check this connection", "Is this installed correctly?"
ADVANCED indicators: "Check for anomalies", "Verify torque spec indicators"

====================================================
BEGINNER SPOKEN SCRIPT
====================================================

### OPENING
"Alright, Leon. Please show me the component using the camera.
Take your time and keep the image steady."

### EXPLANATION
"I'm looking at how the component is installed,
how it's connected,
and whether anything looks out of place."

### GUIDANCE
"If needed, I'll ask you to move closer or adjust the angle."

### IDENTIFICATION
"This appears to be [component name].
It's used for [function].
Let me check if it looks correctly installed."

### CHECK-IN
"Would you like me to check another area, or explain what I'm seeing in more detail?"

====================================================
INTERMEDIATE SPOKEN SCRIPT
====================================================

### OPENING
"Okay, Leon. I'm identifying the component and its surrounding connections."

### COMPARISON
"This part should be mounted here,
this connector should be seated fully,
and this wiring should be routed cleanly."

### DETECTION
"I'm checking for missing fasteners,
incorrect routing,
or obvious installation errors."

### ASSESSMENT
"Based on what I see:
- Mounting: [correct/incorrect]
- Connections: [secure/loose/missing]
- Routing: [proper/improper]"

### CHECK-IN
"Do you want me to focus on a specific connection or check another component?"

====================================================
ADVANCED SPOKEN SCRIPT
====================================================

### OPENING
"Leon, I'm now checking for anomalies."

### ANOMALY DETECTION
"This connector appears misaligned."
"This hose routing differs from standard installation."
"This fastener may be missing or incorrectly torqued."

### PREVENTION LOGIC
"This could lead to a failure later.
Correcting it now prevents repeat repairs."

### DOCUMENTATION
"I recommend documenting this finding for the repair order."

### FUTURE-READY NOTE
"This mode is designed to work with external cameras and AI glasses,
allowing real-time verification during repairs."

### PROFESSIONAL CLOSE
"Tell me which area you want to inspect next, and we'll proceed systematically."

====================================================
RULES
====================================================
- Focus on WHAT YOU SEE, not assumptions
- If the image is unclear, ask for repositioning or better lighting
- Do NOT jump into symptom-based diagnosis
- Do NOT guess about components you cannot clearly identify
- Stay in visual inspection mode unless explicitly asked to diagnose
"""

# ===================== ALEXIS SYMPTOM AUDIO DIAGNOSTICS SYSTEM PROMPT =====================
# HARD DIAGNOSTIC AUTHORITY MODE + MASTER BACKBONE + IMMOBILISER/KEY SPINES
# FROZEN CORE: ALEXIS_DIAGNOSTIC_BRAIN_v1.0
ALEXIS_DIAGNOSTIC_BRAIN_v1_0 = """
ALEXIS – MASTER SYMPTOM / AUDIO DIAGNOSTIC AUTHORITY
MODE: HARD SEQUENTIAL DIAGNOSIS (VOICE & TEXT)
"""

# ACTIVE BRAIN: ALEXIS_DIAGNOSTIC_BRAIN_v1.1 (REASONING HARDENING)
ALEXIS_DIAGNOSTIC_BRAIN_v1_1 = """
ALEXIS_DIAGNOSTIC_BRAIN_v1.1
VERSION: 1.1
STATUS: ACTIVE
CHANGE TYPE: REASONING HARDENING (NON-BREAKING)

This version preserves ALL diagnostic spines, gates, execution order, safety
constraints, and functional behaviours defined in v1.0.
It ADDS a mandatory reasoning doctrine and response mode control without
altering any diagnostic gate or priority.

====================================================
MANDATORY REASONING DOCTRINE (v1.1)
====================================================

You diagnose by CAUSAL COLLAPSE: reducing multiple hypotheses to a single
truth using the smallest number of decisive observations.

RULE 1 – LOCK THE SYSTEM STATE
- Before any test or conclusion, explicitly declare engine state, electrical
  state, and ECU state.
- Treat repeatable or time-bound behaviour as a diagnostic signal.

RULE 2 – SEPARATE THE THREE TRUTHS
- Evaluate faults in this order:
  1) Electrical truth
  2) Mechanical truth
  3) ECU logic truth
- Never mix layers implicitly. When a layer is eliminated, state that it is
  eliminated.

RULE 3 – DECLARE MECHANISMS, NOT SYMPTOMS
- Always explain HOW a fault can exist using physical, electrical, or logical
  mechanisms. Vague descriptions are forbidden.

RULE 4 – ECU LOGIC DOMINATES OUTCOME
- For timed stalls, limp mode, module drop-out or fixed-time behaviour, treat
  ECU state-machine and plausibility windows as the primary cause and state
  that the ECU performs shutdown intentionally after a condition fails.

RULE 5 – ONE QUESTION, ONE COLLAPSING TEST
- When asked for the most conclusive test, provide ONE test only that
  collapses multiple hypotheses at once (dynamic and time-aware when needed).

RULE 6 – MULTIMETERS ARE SECONDARY TO TIME
- For faults under load, vibration, rapid movement, or startup windows,
  explicitly state why a multimeter is insufficient and why a scope or live
  data is mandatory.

RULE 7 – DIAGNOSTIC SEQUENCING IS NON-NEGOTIABLE
- Never allow leak-off before signal integrity, CAN diagnosis without
  topology, or DTC clearing before electrical integrity.
- If the technician attempts this, warn and refuse to proceed.

RULE 8 – DECLARATIVE AUTHORITY
- Replace hedging with declarative language:
  "This condition is caused when…" and
  "This test is chosen because it eliminates all remaining alternatives."

RULE 9 – PRESERVE FORENSIC EVIDENCE
- Warn against clearing sporadic codes, disconnecting batteries, or replacing
  parts that erase failure context before evidence is captured.

RULE 10 – TEACH WHILE DIAGNOSING
- Every response must improve technician understanding by stating why the test
  is chosen and how its outcomes confirm or eliminate hypotheses.

====================================================
RESPONSE MODES
====================================================

You support two presentation modes with IDENTICAL diagnostic logic:

1) TECHNICIAN EXPLANATION MODE (DEFAULT)
   - Activated when the user asks to explain, teach, or understand.
   - Structure:
     1) Locked system state
     2) Brief causal explanation
     3) Diagnostic reasoning (how hypotheses are eliminated)
     4) Recommended test with explanation
     5) Interpretation of possible outcomes

2) AUTHORITY MODE (EXPLICIT REQUEST ONLY)
   - Activated only on phrases like "authority mode", "command mode",
     "no explanation", "what do I do next".
   - Structure:
     1) Locked system state (one concise sentence)
     2) Single collapsing command
     3) Expected result and conclusion

MODE SEPARATION RULE:
- Do NOT mix modes in a single response.
- If intent is unclear, default to Technician Explanation Mode.

All other spines, diesel gates, immobiliser/ key coding logic, DTC
support-only rules, and LOCKED/COMMAND/EXPECTED formatting from v1.0
remain in force and unchanged.
"""

# ====================================================
# CRANK-NO-START SEQUENCE
# ====================================================
# 1. Lock vehicle -> Command: measure crank voltage
# 2. Voltage OK -> Command: confirm ECU power stable during crank
# 3. ECU OK -> Command: report RPM during crank  
# 4. RPM OK -> Command: confirm spark (petrol) or rail pressure (diesel)
# 5. Ignition OK -> Command: confirm injector pulse and fuel pressure
# 6. Fuel OK -> Command: compression test

# ====================================================
# DTC VALIDATION RULESET (HARD DTC AUTHORITY - CONTROLLER MODE)
# ====================================================

# The DTC controller has a LIMITED role:
# - It may only VALIDATE, REFUSE, or HAND OFF.
# - It may NOT command physical tests, mention voltages, or override the crank–no–start controller.

# LEVELLED VEHICLE IDENTITY
# -------------------------
# LEVEL 1 – PROVISIONAL IDENTITY (for DTC applicability ONLY):
#   - Make, model line, fuel type
# LEVEL 2 – FULL IDENTITY (for diagnosis and measurements):
#   - Year, engine code, ECU family

# RULE:
# - Applicability / namespace checks may proceed with LEVEL 1.
# - Any physical measurement or detailed diagnosis requires LEVEL 2.
# - Never refuse at LEVEL 1 unless the DTC / sensor is impossible for that platform.

# PHASE D0 – VEHICLE IDENTITY LOCK
# - If LEVEL 1 is incomplete ->
#   COMMAND: "Vehicle identity incomplete. DTC diagnosis refused until confirmed."
# - Once identity is locked, do NOT later claim it is incomplete.

# PHASE D1 – DTC ORIGIN VALIDATION
# - Confirm that the DTC was read directly from the ECU, not inferred by the scan tool.
# - If not ECU–reported ->
#   LOCK: Invalid DTC source
#   COMMAND: "This code is not reported by the ECU. Diagnosis refused."

# PHASE D2 – DTC APPLICABILITY CHECK
# - Validate that the DTC is defined for this ECU family / engine / fuel type.
# - Validate that the related component exists on this engine and in this software generation.
# - If any check fails ->
#   LOCK: DTC not applicable
#   COMMAND: "This DTC does not belong to this vehicle configuration. Diagnosis refused."
# - No interpretation or sensor naming is allowed before applicability is confirmed.

# GENERIC DTC PROVISIONAL ACCEPTANCE (P0xxx)
# -----------------------------------------
# - Generic DTCs may be provisionally applicable if fuel type and platform support the sensor.
# - In this provisional state the controller MUST NOT diagnose or quote values.
# - It may only request:
#   COMMAND: "Confirm DTC status (current/pending) and fault setting conditions from the ECU."

# MANUFACTURER–SPECIFIC DTCs
# --------------------------
# - Manufacturer codes (e.g. BMW P13C0) must stay inside manufacturer namespace.
# - They must not be treated as generic P0xxx codes.
# - After the vehicle / ECU family is locked they should NOT be refused purely on generic mapping.
# - Allowed action:
#   COMMAND: "Confirm DTC status and fault conditions as recorded by this ECU."

# PHASE D3 – CONTEXT & CAUSALITY VALIDATION
# - Confirm DTC status (current / pending / history) and whether it is linked to the CURRENT symptom.
# - If DTC is applicable but NON-CAUSAL for the active symptom (e.g. P0420 with crank–no–start) ->
#   LOCK: Non–causal DTC
#   COMMAND: "DTC applicable but not causally linked to current symptom. DTC diagnosis blocked. Continue engine fundamentals."
#   EXPECTED: "DTC recorded but locked out of this fault path."
#   - DO NOT request DTC status
#   - DO NOT request fault conditions
#   - DO NOT issue any commands beyond this termination line
# - Only when DTC is potentially causal may the controller request DTC status / fault conditions.

# PHASE D4 – DIAGNOSIS PERMISSION
# - Only after D0–D3 pass and FULL identity (LEVEL 2) is available may another controller
#   (e.g. the crank–no–start sequence) command physical measurements.
# - The DTC controller itself never issues those tests; it only hands off.

# DTC + CRANK–NO–START INTERLOCK
# -------------------------------
# - DTCs cannot override locked physical states from the crank–no–start controller.
# - Electrical survival and ECU power locks always take priority.
# - DTCs remain secondary until engine fundamentals are proven.

# DTC RESPONSE FORMAT (CONTROLLER)
# --------------------------------
# LOCKED: [vehicle identity level + DTC status/applicability]
# COMMAND: One of -> "DTC diagnosis refused: [reason]" OR a request for DTC status / conditions OR a hand–off instruction.
# EXPECTED: Brief confirmation criteria where applicable – never sensor values or voltage ranges.

# FORBIDDEN LANGUAGE (DTC CONTROLLER)
# -----------------------------------
# - "Usually means" – FORBIDDEN
# - "Common cause" – FORBIDDEN
# - "On most vehicles" – FORBIDDEN
# - "This code indicates" (before applicability validation) – FORBIDDEN
# - "Could be" – FORBIDDEN
# - "Possible causes" – FORBIDDEN

# ===================== MODELS =====================
# Safety classification helpers
SAFETY_KEYWORDS = [
    "disconnect battery",
    "disconnect the battery",
    "bypass relay",
    "bypass the relay",
    "jumper wire",
    "jump wire",
    "jump the relay",
    "apply external voltage",
    "probe airbag",
    "srs circuit",
    "airbag circuit",
    "fuel rail",
    "high pressure fuel",
    "open the fuel line",
    "depressurize fuel",
    "crank with sensor disconnected",
    "flash ecu",
    "reprogram ecu",
    "immobiliser pin",
    "short to battery",
    "short to ground",
]

APPROVED_CONFIRMATION_PHRASES = {
    "confirmed",
    "proceed",
    "i confirm",
    "yes, proceed",
    "do it",
    "continue",
}


def is_safety_critical_instruction(text: str) -> bool:
    lowered = text.lower()
    return any(kw in lowered for kw in SAFETY_KEYWORDS)


class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str

class LoginRequest(BaseModel):
    name: str
    email: str

class LoginResponse(BaseModel):
    technician_id: str
    token: str
    name: str
    email: str

class SessionStartRequest(BaseModel):
    technician_id: str
    vehicle_year: Optional[str] = None
    vehicle_make: Optional[str] = None
    vehicle_model: Optional[str] = None

class SessionStartResponse(BaseModel):
    session_id: str
    live: bool
    rules_version: str
    technician_id: str
    created_at: str

class ChatRequest(BaseModel):
    session_id: str
    transcript: str
    context: Optional[str] = "symptom_audio_diagnostics"  # "diagram_assistance", "visual_inspection", or "symptom_audio_diagnostics"
    response_mode: Optional[str] = "EXPLANATION"  # "EXPLANATION" or "AUTHORITY"
    safety_confirmed: Optional[bool] = False
    safety_confirmation_source: Optional[str] = None  # "UI" or "VOICE"
    safety_confirmation_phrase: Optional[str] = None
    tap_context: Optional[dict] = None  # For diagram teaching tap-to-teach
    diagram_context: Optional[dict] = None  # NEW: Diagram metadata for ALEXIS awareness

class OverlayCommand(BaseModel):
    type: str  # "HIGHLIGHT_BOX" | "PULSE_DOT" | "TRACE_PATH" | "ARROW_POINTER"
    page: int
    bounds: Optional[dict] = None
    pathPoints: Optional[list] = None
    anchor: Optional[dict] = None
    style: Optional[dict] = None
    durationMs: Optional[int] = 1500


class ChatResponse(BaseModel):
    response: str
    session_id: str
    overlayCommands: Optional[list[OverlayCommand]] = None

class TTSRequest(BaseModel):
    text: str
    session_id: str

class STTResponse(BaseModel):
    transcript: str
    confidence: float

# ===================== AUTH ENDPOINTS =====================
@api_router.post("/auth/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    """
    Simple login - creates or retrieves technician record
    No password required for DEV mode
    """
    logger.info(f"LOGIN REQUEST: name={request.name}, email={request.email}")
    
    # Check if technician exists
    technician = await db.technicians.find_one({"email": request.email}, {"_id": 0})
    
    if not technician:
        # Create new technician
        technician_id = str(uuid.uuid4())
        technician = {
            "id": technician_id,
            "name": request.name,
            "email": request.email,
            "tier": "FREE",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.technicians.insert_one(technician)
        logger.info(f"LOGIN: Created new technician {technician_id}")
    else:
        technician_id = technician["id"]
        # Update name if changed
        if technician["name"] != request.name:
            await db.technicians.update_one(
                {"email": request.email},
                {"$set": {"name": request.name}}
            )
        logger.info(f"LOGIN: Found existing technician {technician_id}")
    
    # Generate simple token (for DEV - in production use JWT)
    token = f"alexis-token-{technician_id}-{uuid.uuid4().hex[:8]}"
    
    return LoginResponse(
        technician_id=technician_id,
        token=token,
        name=request.name,
        email=request.email
    )

# ===================== SESSION ENDPOINTS =====================
@api_router.post("/session/start", response_model=SessionStartResponse)
async def start_session(request: SessionStartRequest):
    """
    Creates a new diagnostic session for the technician
    Returns session_id and live=true for LIVE READ-ONLY mode
    """
    logger.info(f"SESSION START: technician_id={request.technician_id}")
    
    session_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    
    session = {
        "id": session_id,
        "technician_id": request.technician_id,
        "live": True,
        "rules_version": "ALEXIS_DS_v1.0",
        "mode": "READ_ONLY",
        "vehicle": {
            "year": request.vehicle_year,
            "make": request.vehicle_make,
            "model": request.vehicle_model
        },
        "conversation_history": [],
        "created_at": created_at,
        "updated_at": created_at
    }
    
    await db.sessions.insert_one(session)
    logger.info(f"SESSION CREATED: session_id={session_id}, live=True, rules_version=ALEXIS_DS_v1.0")
    
    return SessionStartResponse(
        session_id=session_id,
        live=True,
        rules_version="ALEXIS_DS_v1.0",
        technician_id=request.technician_id,
        created_at=created_at
    )

# ===================== STT ENDPOINT =====================
@api_router.post("/stt", response_model=STTResponse)
async def speech_to_text(audio: UploadFile = File(...)):
    """
    Convert audio to text using Azure Speech STT
    Handles WebM/Opus from browser, converts to WAV for Azure
    """
    logger.info(f"STT REQUEST: filename={audio.filename}, content_type={audio.content_type}")
    
    if not AZURE_SPEECH_KEY:
        logger.error("STT FAILED: AZURE_SPEECH_KEY not configured")
        raise HTTPException(status_code=500, detail="Azure Speech not configured")
    
    import subprocess
    import tempfile
    import os
    
    webm_path = None
    wav_path = None
    
    try:
        # Read audio data
        audio_data = await audio.read()
        logger.info(f"STT: Received {len(audio_data)} bytes of audio")
        
        if len(audio_data) < 1000:
            logger.warning("STT: Audio too short, likely no speech")
            return STTResponse(transcript="", confidence=0.0)
        
        # Convert WebM/Opus to WAV using ffmpeg
        with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as webm_file:
            webm_path = webm_file.name
            webm_file.write(audio_data)
        
        wav_path = webm_path.replace('.webm', '.wav')
        
        # FFmpeg conversion: WebM -> WAV (16kHz, mono, 16-bit PCM)
        # Use full path to ffmpeg for reliability
        ffmpeg_cmd = [
            '/usr/bin/ffmpeg', '-y', '-i', webm_path,
            '-ar', '16000',  # 16kHz sample rate
            '-ac', '1',      # Mono
            '-f', 'wav',     # WAV format
            wav_path
        ]
        
        logger.info(f"STT: Converting audio with ffmpeg: {' '.join(ffmpeg_cmd)}")
        result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True, timeout=30)
        
        if result.returncode != 0:
            logger.error(f"STT: FFmpeg failed with code {result.returncode}")
            logger.error(f"STT: FFmpeg stderr: {result.stderr}")
            logger.error(f"STT: FFmpeg stdout: {result.stdout}")
            raise HTTPException(status_code=500, detail=f"Audio conversion failed: {result.stderr[:200]}")
        
        logger.info("STT: FFmpeg conversion successful")
        
        # Read converted WAV
        if not os.path.exists(wav_path):
            logger.error(f"STT: WAV file not created at {wav_path}")
            raise HTTPException(status_code=500, detail="WAV file not created")
            
        with open(wav_path, 'rb') as wav_file:
            wav_data = wav_file.read()
        
        logger.info(f"STT: Converted to WAV, {len(wav_data)} bytes")
        
        if len(wav_data) < 100:
            logger.error("STT: WAV file too small")
            raise HTTPException(status_code=500, detail="Audio conversion produced empty file")
        
        # Configure Azure Speech
        speech_config = speechsdk.SpeechConfig(
            subscription=AZURE_SPEECH_KEY,
            region=AZURE_SPEECH_REGION
        )
        speech_config.speech_recognition_language = "en-US"
        
        # Create audio stream from WAV bytes (skip WAV header - 44 bytes)
        audio_format = speechsdk.audio.AudioStreamFormat(
            samples_per_second=16000,
            bits_per_sample=16,
            channels=1
        )
        audio_stream = speechsdk.audio.PushAudioInputStream(stream_format=audio_format)
        
        # Write PCM data (skip 44-byte WAV header)
        pcm_data = wav_data[44:]
        logger.info(f"STT: Writing {len(pcm_data)} bytes of PCM data to Azure stream")
        audio_stream.write(pcm_data)
        audio_stream.close()
        
        audio_config = speechsdk.audio.AudioConfig(stream=audio_stream)
        
        # Create recognizer
        recognizer = speechsdk.SpeechRecognizer(
            speech_config=speech_config,
            audio_config=audio_config
        )
        
        # Recognize speech
        logger.info("STT: Starting Azure recognition...")
        result = recognizer.recognize_once()
        
        if result.reason == speechsdk.ResultReason.RecognizedSpeech:
            logger.info(f"STT SUCCESS: transcript='{result.text}'")
            confidence = 0.95 if result.text else 0.0
            return STTResponse(transcript=result.text, confidence=confidence)
        elif result.reason == speechsdk.ResultReason.NoMatch:
            no_match_details = result.no_match_details
            logger.warning(f"STT NO MATCH: reason={no_match_details.reason}")
            return STTResponse(transcript="", confidence=0.0)
        elif result.reason == speechsdk.ResultReason.Canceled:
            cancellation = result.cancellation_details
            logger.error(f"STT CANCELED: reason={cancellation.reason}")
            logger.error(f"STT CANCELED: error_details={cancellation.error_details}")
            raise HTTPException(status_code=500, detail=f"Speech recognition canceled: {cancellation.error_details}")
        
        return STTResponse(transcript="", confidence=0.0)
        
    except subprocess.TimeoutExpired:
        logger.error("STT: FFmpeg timeout after 30 seconds")
        raise HTTPException(status_code=500, detail="Audio conversion timeout")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"STT ERROR: {type(e).__name__}: {str(e)}")
        import traceback
        logger.error(f"STT TRACEBACK: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"STT failed: {str(e)}")
    finally:
        # Clean up temp files
        try:
            if webm_path and os.path.exists(webm_path):
                os.unlink(webm_path)
            if wav_path and os.path.exists(wav_path):
                os.unlink(wav_path)
        except Exception as cleanup_err:
            logger.warning(f"STT: Cleanup failed: {cleanup_err}")

# ===================== DIAGRAM OVERLAY GENERATION =====================

def generate_diagram_overlays(response_text: str, diagram_context: dict) -> list[OverlayCommand]:
    """
    Generate visual overlays based on ALEXIS's response content.
    VISUAL DISCIPLINE: Single calm highlight, no rapid blinking.
    """
    overlays = []
    current_page = diagram_context.get("currentPage", 1) if diagram_context else 1
    
    # If there's a selected region, use it as the PRIMARY highlight (single, calm)
    selected_region = diagram_context.get("selectedRegion") if diagram_context else None
    if selected_region and selected_region.get("bounds"):
        bounds = selected_region["bounds"]
        # Single calm highlight box - no additional markers to avoid visual noise
        overlays.append(OverlayCommand(
            type="HIGHLIGHT_BOX",
            page=selected_region.get("page", current_page),
            bounds={
                "x": bounds.get("x", 100),
                "y": bounds.get("y", 100),
                "width": bounds.get("width", 100),
                "height": bounds.get("height", 80)
            },
            style={"color": "cyan", "intensity": 0.5},  # Softer intensity
            durationMs=12000,  # Longer duration for calm teaching
        ))
        return overlays  # Only one highlight - visual discipline
    
    # For text-based responses, generate a SINGLE appropriate overlay
    response_lower = response_text.lower()
    
    # Priority order - only generate ONE overlay type
    if any(word in response_lower for word in ["relay", "coil", "contacts"]):
        overlays.append(OverlayCommand(
            type="HIGHLIGHT_BOX",
            page=current_page,
            bounds={"x": 150, "y": 100, "width": 120, "height": 80},
            style={"color": "cyan", "intensity": 0.4},
            durationMs=10000,
        ))
    elif any(word in response_lower for word in ["ground", "earth", "chassis"]):
        overlays.append(OverlayCommand(
            type="HIGHLIGHT_BOX",
            page=current_page,
            bounds={"x": 80, "y": 280, "width": 60, "height": 50},
            style={"color": "green", "intensity": 0.4},
            durationMs=10000,
        ))
    elif any(word in response_lower for word in ["wire", "circuit", "path", "connection"]):
        overlays.append(OverlayCommand(
            type="TRACE_PATH",
            page=current_page,
            pathPoints=[
                {"x": 100, "y": 150},
                {"x": 200, "y": 150},
                {"x": 250, "y": 200},
            ],
            style={"color": "cyan", "intensity": 0.5},
            durationMs=10000,
        ))
    elif any(word in response_lower for word in ["ecu", "module", "controller"]):
        overlays.append(OverlayCommand(
            type="HIGHLIGHT_BOX",
            page=current_page,
            bounds={"x": 300, "y": 100, "width": 150, "height": 100},
            style={"color": "purple", "intensity": 0.4},
            durationMs=10000,
        ))
    elif any(word in response_lower for word in ["pin", "connector", "terminal"]):
        overlays.append(OverlayCommand(
            type="HIGHLIGHT_BOX",
            page=current_page,
            bounds={"x": 230, "y": 160, "width": 40, "height": 40},
            style={"color": "yellow", "intensity": 0.5},
            durationMs=10000,
        ))
    elif any(word in response_lower for word in ["fuse", "protection"]):
        overlays.append(OverlayCommand(
            type="HIGHLIGHT_BOX",
            page=current_page,
            bounds={"x": 50, "y": 50, "width": 60, "height": 40},
            style={"color": "yellow", "intensity": 0.4},
            durationMs=10000,
        ))
    
    # If teaching but no specific element detected, provide subtle area indicator
    if not overlays and diagram_context and diagram_context.get("loaded"):
        overlays.append(OverlayCommand(
            type="HIGHLIGHT_BOX",
            page=current_page,
            bounds={"x": 150, "y": 150, "width": 200, "height": 150},
            style={"color": "cyan", "intensity": 0.25},  # Very soft
            durationMs=8000,
        ))
    
    return overlays


# ===================== DIAGRAM TAP RESOLUTION =====================

def resolve_diagram_tap(tap_context: dict) -> Optional[tuple[str, list[OverlayCommand]]]:
    """Very simple symbol resolution for tap-to-teach.

    For v1.0, we treat a fixed region on page 1 as a single teaching target.
    Any tap inside this region is considered a valid symbol; outside is ambiguous.
    """
    try:
        page = tap_context.get("page")
        x = float(tap_context.get("x"))
        y = float(tap_context.get("y"))
    except Exception:
        return None

    if page != 1:
        return None

    # Fixed demo region (must match approximate coordinates used in overlays)
    region = {"x": 100, "y": 100, "width": 160, "height": 90}

    if not (region["x"] <= x <= region["x"] + region["width"] and region["y"] <= y <= region["y"] + region["height"]):
        return None

    overlay_cmds = [
        OverlayCommand(
            type="HIGHLIGHT_BOX",
            page=1,
            bounds={"x": region["x"], "y": region["y"], "width": region["width"], "height": region["height"]},
            style={"color": "cyan", "intensity": 0.5},
            durationMs=2500,
        ),
        OverlayCommand(
            type="PULSE_DOT",
            page=1,
            anchor={"x": region["x"] + region["width"] / 2, "y": region["y"] + region["height"] / 2},
            style={"color": "yellow", "intensity": 0.8, "pulse": True},
            durationMs=2500,
        ),
    ]
    speech = "You are pointing at this component here. This is the section of the diagram we will focus on."
    return speech, overlay_cmds

# ===================== DIAGNOSTIC CHAT ENDPOINT =====================
@api_router.post("/diagnostic/chat", response_model=ChatResponse)
async def diagnostic_chat(request: ChatRequest):
    """
    Send transcript to GPT-4.1 for ALEXIS response.
    SYSTEM FALLBACK MODE:
    - Any error at any stage returns a stable fallback message with HTTP 200.
    - No diagnostic commands or DTC discussion are emitted in fallback.
    """
    logger.info("CHAT ENTRYPOINT HIT – /api/diagnostic/chat")
    try:
        import json as _json_dbg
        logger.info("CHAT RAW REQUEST META: " + _json_dbg.dumps({
            "url": str(request.url) if hasattr(request, "url") else "n/a",
            "headers": {k: v for k, v in getattr(request, "headers", {}).items() if k.lower() not in ["authorization", "cookie"]}
        }))
    except Exception:
        logger.warning("CHAT: failed to log request URL/headers for debug")
    logger.info(f"CHAT REQUEST: session_id={request.session_id}, context={request.context}, transcript='{request.transcript[:100]}...', response_mode={request.response_mode}")
    fallback_text = "System online. Awaiting a diagnostic request."
    correlation_id = str(uuid.uuid4())
    stage = "intent_detection"

    # Mode audit log
    try:
        await db.audit_events.insert_one({
            "id": str(uuid.uuid4()),
            "session_id": request.session_id,
            "event_type": "chat_mode",
            "response_mode": request.response_mode or "EXPLANATION",
            "context": request.context,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        logger.warning("CHAT: failed to write mode audit event")

    try:
        # 1) NORMALIZE INPUT
        transcript = (request.transcript or "").strip()
        upper_transcript = transcript.upper()

        # If we have a diagram tap context, we bypass normal text intent for diagram_assistance
        tap_ctx = request.tap_context if isinstance(request.tap_context, dict) else None

        # 2) INTENT CLASSIFICATION (FLAGS ONLY)
        has_dtc = bool(re.search(r"\b[PBCU][0-3][0-9A-F]{3}\b", transcript, flags=re.IGNORECASE))
        has_diag_keywords = any(
            kw in upper_transcript
            for kw in [
                "DTC",
                "CODE",
                "CRANK",
                "NO START",
                "NO-START",
                "NOT START",
                "WON'T START",
                "WONT START",
                "DOESN'T START",
                "DOESNT START",
                "WILL NOT START",
                "STARTING PROBLEM",
                "START PROBLEM",
                "FAULT",
                "MISFIRE",
                "NO COMMUNICATION",
                "NO COMMS",
                "CANNOT COMMUNICATE",
                "OBD NOT WORKING",
                "SCANNER NOT CONNECTING",
                "NO CONNECTION",
                "DLC",
                "OBD PORT",
                "DIAGNOSTIC PORT",
                "PINS 6 AND 14",
                "CAN HIGH",
                "CAN LOW",
                "CAN BUS",
                "K-LINE",
                "ISO LINE",
                "ENGINE",
                "STALL",
                "IDLE",
                "CHECK ENGINE",
                "WARNING LIGHT",
                "BATTERY",
                "ALTERNATOR",
                "POWER",
                "ELECTRICAL",
                "FUEL",
                "INJECTION",
                "SPARK",
                "IGNITION",
                "IMMOBIL",
                "KEY",
                "TRANSMISSION",
                "GEARBOX",
                "ABS",
                "BRAKE",
                "AIRBAG",
                "SENSOR",
                "PUMP",
                "RELAY",
                "FUSE",
                "GROUND",
                "VOLTAGE",
                "SYMPTOM",
                "PROBLEM",
                "ISSUE",
                "DIAGNOS",
                "REPAIR",
                "FIX",
            ]
        )
        
        # For diagram assistance and visual inspection, accept any non-empty transcript
        # For voice diagnostics, be more lenient - accept conversational input
        if request.context == "diagram_assistance":
            is_diagnostic_intent = bool(transcript)
        elif request.context == "visual_inspection":
            is_diagnostic_intent = bool(transcript)
        elif request.context == "symptom_audio_diagnostics":
            # Voice diagnostics should accept any spoken input
            # Only filter out if it's completely empty
            is_diagnostic_intent = bool(transcript) and len(transcript) > 2
        else:
            is_diagnostic_intent = bool(transcript) and (has_dtc or has_diag_keywords)

        # 3) ROUTING DECISION
        if not is_diagnostic_intent and not (request.context == "diagram_assistance" and tap_ctx):
            stage = "router_fallback"
            # Non-diagnostic / conversational / unclear → fallback response (no exception)
            try:
                await db.audit_events.insert_one({
                    "id": str(uuid.uuid4()),
                    "session_id": request.session_id,
                    "event_type": "chat_fallback",
                    "stage": "intent_non_diagnostic",
                    "error_class": None,
                    "input": transcript,
                    "output": fallback_text,
                    "response_mode": request.response_mode or "EXPLANATION",
                    "correlation_id": correlation_id,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
            except Exception:
                logger.warning(f"CHAT FALLBACK NON-DIAGNOSTIC AUDIT FAILED [{correlation_id}]")

            return ChatResponse(response=fallback_text, session_id=request.session_id)

        # --------- DIAGNOSTIC PATH: REQUIRE LLM KEY ---------
        stage = "router_session"
        if not EMERGENT_LLM_KEY:
            logger.error("CHAT FAILED: EMERGENT_LLM_KEY not configured")
            # Treat as LLM layer failure but still allow fallback via catch block
            raise RuntimeError("LLM_NOT_CONFIGURED")

        # From here on we are in the diagnostic controller path
        logger.info("DIAGNOSTIC CONTROLLER INVOKED")
        stage = "router_session"

        # Get session for context
        stage = "router_session"
        session = await db.sessions.find_one({"id": request.session_id}, {"_id": 0})
        
        if not session:
            logger.warning(f"CHAT: Session {request.session_id} not found, creating temporary context")
            session = {"vehicle": {}, "conversation_history": []}

        # Select system prompt based on context - STRICT SEPARATION
        stage = "router_context"
        if request.context == "diagram_assistance":
            base_prompt = ALEXIS_DIAGRAM_PROMPT
            logger.info("CHAT: Using DIAGRAM_ASSISTANCE context (Wiring Diagrams)")
        elif request.context == "visual_inspection":
            base_prompt = ALEXIS_VISUAL_PROMPT
            logger.info("CHAT: Using VISUAL_INSPECTION context (Visual Diagnostics)")
        elif request.context == "symptom_audio_diagnostics":
            base_prompt = ALEXIS_SYSTEM_PROMPT
            logger.info("CHAT: Using SYMPTOM_AUDIO_DIAGNOSTICS context (Voice Diagnostics)")
        else:
            # Unknown context → treat as non-diagnostic / malformed input
            logger.warning(f"CHAT: Unknown context '{request.context}', activating fallback controller")
            raise RuntimeError("UNKNOWN_CONTEXT")
        
        # Build context-aware system prompt
        stage = "formatter_prompt"
        vehicle_context = ""
        if session.get("vehicle"):
            v = session["vehicle"]
            if v.get("year") or v.get("make") or v.get("model"):
                vehicle_context = f"\n\n## CURRENT VEHICLE\nYear: {v.get('year', 'Unknown')}\nMake: {v.get('make', 'Unknown')}\nModel: {v.get('model', 'Unknown')}"
        
        # Build diagram context for ALEXIS awareness (CRITICAL FOR DIAGRAM BINDING)
        diagram_status = ""
        selected_region_info = ""
        if request.context == "diagram_assistance":
            diag_ctx = request.diagram_context
            if diag_ctx and diag_ctx.get("loaded"):
                diagram_status = f"""

## DIAGRAM_STATUS
DIAGRAM_LOADED: TRUE
FILENAME: {diag_ctx.get('filename', 'Unknown')}
TOTAL_PAGES: {diag_ctx.get('totalPages', 'Unknown')}
CURRENT_PAGE: {diag_ctx.get('currentPage', 1)}

You can see this wiring diagram. The technician has already loaded it. Do NOT ask them to upload it again.
"""
                # Check for selected region
                selected = diag_ctx.get('selectedRegion')
                if selected and selected.get('bounds'):
                    bounds = selected['bounds']
                    selected_region_info = f"""

## SELECTED_REGION
The technician has selected a specific region on the diagram for you to explain.
PAGE: {selected.get('page', 1)}
COORDINATES: x={bounds.get('x', 0):.0f}, y={bounds.get('y', 0):.0f}
SIZE: {bounds.get('width', 0):.0f}x{bounds.get('height', 0):.0f} pixels

IMPORTANT: You MUST explain what is in this selected region. The region is highlighted on their screen.
Describe what components, wires, connectors, or symbols are visible in this area.
"""
                    logger.info(f"CHAT: Region selected - page {selected.get('page')}, bounds: {bounds}")
                
                logger.info(f"CHAT: Diagram context bound - {diag_ctx.get('filename')}, {diag_ctx.get('totalPages')} pages")
            else:
                diagram_status = """

## DIAGRAM_STATUS
DIAGRAM_LOADED: FALSE

No diagram is currently loaded. Ask the technician to upload one using the + button.
"""
                logger.info("CHAT: No diagram loaded")
        
        # Attach reasoning doctrine & mode hint for symptom audio diagnostics
        full_system_prompt = base_prompt + vehicle_context + diagram_status + selected_region_info
        if request.context == "symptom_audio_diagnostics":
            mode_hint = "\n\nCURRENT RESPONSE MODE: " + (request.response_mode or "EXPLANATION") + "\n"
            full_system_prompt += mode_hint
        
        # Build conversation history for context with format reinforcement
        history = session.get("conversation_history", [])
        initial_messages = []
        for entry in history[-10:]:  # Last 10 messages for context
            if entry.get("role") == "technician":
                initial_messages.append({"role": "user", "content": entry["text"]})
            elif entry.get("role") == "alexis":
                initial_messages.append({"role": "assistant", "content": entry["text"]})
        
        # Add format reinforcement if there's history (for symptom diagnostics)
        format_reminder = ""
        if history and request.context == "symptom_audio_diagnostics":
            format_reminder = "\n\n[REMINDER: Respond ONLY in LOCKED/COMMAND/EXPECTED format. No questions. No explanations. No lists.]"
        
        # Initialize LlmChat with GPT-4.1
        stage = "llm_init"
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=request.session_id,
            system_message=full_system_prompt + format_reminder,
            initial_messages=initial_messages if initial_messages else None
        )
        chat.with_model("openai", "gpt-4.1")
        
        # Send current message with format enforcement for symptom diagnostics
        stage = "llm_send"
        if request.context == "symptom_audio_diagnostics":
            enforced_transcript = f"{request.transcript}\n\n[Respond ONLY in format: LOCKED: / COMMAND: / EXPECTED: - nothing else]"
            user_message = UserMessage(text=enforced_transcript)
        else:
            user_message = UserMessage(text=request.transcript)
        logger.info("CHAT: Sending to GPT-4.1...")
        
        response = await chat.send_message(user_message)
        logger.info(f"CHAT SUCCESS: response='{response[:100]}...'")

        # Safety classification for authority mode
        safety_required = False
        if (request.response_mode or "EXPLANATION") == "AUTHORITY" and request.context == "symptom_audio_diagnostics":
            safety_required = is_safety_critical_instruction(response)

        # If safety is required but not confirmed, do NOT return the instruction
        if safety_required and not request.safety_confirmed:
            stage = "safety_pending"
            safety_prompt = "This action affects vehicle safety or control systems. Confirm before proceeding."
            await db.audit_events.insert_one({
                "id": str(uuid.uuid4()),
                "session_id": request.session_id,
                "event_type": "chat_safety_pending",
                "response_mode": request.response_mode or "EXPLANATION",
                "safety_required": True,
                "original_output": response,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
            return ChatResponse(response=safety_prompt, session_id=request.session_id)

        # If safety is confirmed, log confirmation details
        if safety_required and request.safety_confirmed:
            await db.audit_events.insert_one({
                "id": str(uuid.uuid4()),
                "session_id": request.session_id,
                "event_type": "chat_safety_confirmed",
                "confirmation_source": request.safety_confirmation_source,
                "confirmation_phrase": request.safety_confirmation_phrase,
                "response_mode": request.response_mode or "EXPLANATION",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
        
        # Build diagram overlays when in diagram assistance context
        overlay_cmds: Optional[list[OverlayCommand]] = None
        if request.context == "diagram_assistance":
            # First check for tap context (specific tap on diagram)
            if tap_ctx:
                tap_result = resolve_diagram_tap(tap_ctx)
                if tap_result is None:
                    guidance_msg = "Please zoom or tap the symbol you want me to explain."
                    await db.audit_events.insert_one({
                        "id": str(uuid.uuid4()),
                        "session_id": request.session_id,
                        "event_type": "diagram_tap_ambiguous",
                        "tap_context": tap_ctx,
                        "output": guidance_msg,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })
                    return ChatResponse(response=guidance_msg, session_id=request.session_id, overlayCommands=None)
                else:
                    tap_speech, overlay_cmds = tap_result
                    # Override model response with tap-specific speech
                    response = tap_speech
            # If no tap but diagram is loaded, generate contextual overlays based on response
            elif request.diagram_context and request.diagram_context.get("loaded"):
                overlay_cmds = generate_diagram_overlays(response, request.diagram_context)
                logger.info(f"CHAT: Generated {len(overlay_cmds)} contextual overlays for diagram teaching")

        # Update session conversation history
        stage = "formatter_history"
        await db.sessions.update_one(
            {"id": request.session_id},
            {
                "$push": {
                    "conversation_history": {
                        "$each": [
                            {"role": "technician", "text": request.transcript, "timestamp": datetime.now(timezone.utc).isoformat()},
                            {"role": "alexis", "text": response, "timestamp": datetime.now(timezone.utc).isoformat()}
                        ]
                    }
                },
                "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
            }
        )
        
        # Log to audit
        stage = "formatter_audit"
        await db.audit_events.insert_one({
            "id": str(uuid.uuid4()),
            "session_id": request.session_id,
            "event_type": "chat",
            "input": request.transcript,
            "output": response,
            "correlation_id": correlation_id,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        
        return ChatResponse(response=response, session_id=request.session_id, overlayCommands=overlay_cmds)
        
    except Exception as e:
        # SYSTEM FALLBACK MODE – covers router / intent / LLM / formatter
        logger.error(f"CHAT ERROR [{correlation_id}] at stage '{locals().get('stage', 'unknown')}': {type(e).__name__}: {str(e)}")
        try:
            await db.audit_events.insert_one({
                "id": str(uuid.uuid4()),
                "session_id": request.session_id,
                "event_type": "chat_fallback",
                "input": getattr(request, 'transcript', ''),
                "output": fallback_text,
                "error_class": type(e).__name__,
                "stage": locals().get("stage", "unknown"),
                "correlation_id": correlation_id,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
        except Exception:
            logger.warning(f"CHAT FALLBACK AUDIT FAILED [{correlation_id}]")
        
        # Always return approved fallback text with HTTP 200
        return ChatResponse(response=fallback_text, session_id=request.session_id)

# ===================== TTS ENDPOINT =====================
@api_router.post("/tts")
async def text_to_speech(request: TTSRequest):
    """
    Convert ALEXIS response text to speech using Azure TTS REST API
    Voice: Ava (female, en-US)
    Output: audio/mp3 stream
    Falls back to simple response if Azure fails
    """
    logger.info(f"TTS REQUEST: session_id={request.session_id}, text='{request.text[:100]}...'")
    
    if not AZURE_SPEECH_KEY:
        logger.warning("TTS: AZURE_SPEECH_KEY not configured, returning fallback")
        raise HTTPException(status_code=503, detail="TTS not configured - use browser speech synthesis")
    
    try:
        import requests as http_requests
        
        # Use Azure TTS REST API
        tts_url = f"https://{AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1"
        
        # Clean text for SSML (escape special characters)
        clean_text = request.text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;").replace("'", "&apos;")
        # Remove markdown formatting for speech
        clean_text = clean_text.replace("**", "").replace("*", "").replace("#", "")
        
        # SSML for Ava voice
        ssml = f"""<speak version='1.0' xml:lang='en-US'>
            <voice xml:lang='en-US' name='en-US-AvaNeural'>
                {clean_text}
            </voice>
        </speak>"""
        
        headers = {
            "Ocp-Apim-Subscription-Key": AZURE_SPEECH_KEY,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
            "User-Agent": "ALEXIS-Diagnostic-System"
        }
        
        logger.info("TTS: Sending request to Azure TTS REST API...")
        response = http_requests.post(tts_url, headers=headers, data=ssml.encode('utf-8'), timeout=30)
        
        if response.status_code == 200:
            audio_data = response.content
            logger.info(f"TTS SUCCESS: Generated {len(audio_data)} bytes of audio")
            
            # Log to audit
            await db.audit_events.insert_one({
                "id": str(uuid.uuid4()),
                "session_id": request.session_id,
                "event_type": "tts",
                "input": request.text[:500],
                "output_size": len(audio_data),
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
            
            # Return audio as streaming response
            return StreamingResponse(
                io.BytesIO(audio_data),
                media_type="audio/mpeg",
                headers={"Content-Disposition": "attachment; filename=alexis_response.mp3"}
            )
        else:
            logger.error(f"TTS API ERROR: status={response.status_code}, body={response.text[:200]}")
            # Return 503 to signal frontend to use browser TTS
            raise HTTPException(status_code=503, detail=f"Azure TTS unavailable (status {response.status_code}) - use browser speech synthesis")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"TTS ERROR: {str(e)}")
        raise HTTPException(status_code=503, detail=f"TTS failed: {str(e)} - use browser speech synthesis")

# ===================== ORIGINAL ENDPOINTS =====================
@api_router.get("/")
async def root():
    return {"message": "ALEXIS Backend API - LIVE READ-ONLY Mode"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    _ = await db.status_checks.insert_one(doc)
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    return status_checks

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
