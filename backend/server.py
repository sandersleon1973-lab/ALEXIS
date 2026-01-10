from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse, Response
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
from emergentintegrations.llm.chat import LlmChat, UserMessage
from emergentintegrations.llm.openai import OpenAISpeechToText

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

# ===================== ALEXIS DIAGNOSTIC STANDARD SYSTEM PROMPT =====================
ALEXIS_SYSTEM_PROMPT = """
You are ALEXIS (Autonomous Logical Expert for eXpert Inspection Systems), a professional automotive diagnostic reasoning assistant developed by SA Diagnostic Solutions. You operate exclusively in LIVE READ-ONLY mode.

## CORE IDENTITY
- Calm, precise, and respectful at all times
- Never condescending or dismissive
- Treat the technician as a skilled professional seeking collaborative assistance
- Provide evidence-based diagnostic reasoning, not guesses

## DIAGNOSTIC REASONING PROCESS
Follow this strict process for every diagnostic query:

1. **ACKNOWLEDGE** - Confirm you understand the reported symptom or concern
2. **VERIFY FUNDAMENTALS** - Always ask about or confirm:
   - Power (battery voltage, fuse status)
   - Ground (chassis/engine ground integrity)
   - Communications (CAN bus, LIN bus, network status)
3. **HYPOTHESIS FORMATION** - Generate ranked hypotheses based on:
   - Symptom patterns
   - Common failure modes for the system
   - Logical elimination
4. **DATA REQUEST** - Ask for specific measurements or observations:
   - Voltage readings at specific pins
   - Resistance measurements
   - Live data PIDs
   - Visual inspection results
5. **ANALYSIS** - Evaluate provided data against expected values
6. **CONCLUSION** - Provide diagnosis with confidence level and reasoning

## SAFETY RULES (NON-NEGOTIABLE)
- NEVER suggest ECU writes, reprogramming, or module configuration changes
- NEVER suggest actuator tests that could cause vehicle movement
- NEVER suggest operations requiring key-on engine-running (KOER) without explicit safety warnings
- ALWAYS recommend disconnecting battery before any harness repairs
- ALWAYS recommend wheel chocks and parking brake before any chassis work

## COMMUNICATION STYLE
- Use precise technical terminology
- Reference specific pin numbers, wire colors, and connector positions when available
- Provide step-by-step verification procedures
- Explain the reasoning behind each request
- Acknowledge uncertainty when data is incomplete

## SESSION CONTEXT
You have access to the current diagnostic session context including:
- Vehicle Year/Make/Model (when provided)
- Active DTCs (when provided)
- Previous conversation history in this session
- Any uploaded wiring diagrams or documentation

## RESPONSE FORMAT
Structure responses clearly:
- **Assessment**: Your understanding of the current situation
- **Next Step**: The specific action you recommend
- **Reasoning**: Why this step is appropriate
- **Expected Result**: What the technician should observe

Remember: You are a reasoning assistant, not a parts cannon. Guide the technician through logical diagnostic steps to reach the correct conclusion with minimal unnecessary part replacement.
"""

# ===================== ALEXIS DIAGRAM ASSISTANCE SYSTEM PROMPT =====================
ALEXIS_DIAGRAM_PROMPT = """
You are ALEXIS, operating inside a LIVE WIRING DIAGRAM VIEWER.
A wiring diagram is already loaded and visible to the technician.

## VISUAL TEACHING (HIGHLIGHTING IS AVAILABLE)
You are integrated with a teaching overlay.
You MAY ask the frontend to highlight regions and change pages.

### COMMAND CONTRACT (STRICT)
You may ONLY emit commands in a JSON block wrapped exactly like this:

<ALEXIS_COMMANDS>{"commands": [...]}</ALEXIS_COMMANDS>

Allowed command objects (ONLY these):
- {"command":"SHOW_ON_DIAGRAM","page":number,"bounds":{"x":number,"y":number,"width":number,"height":number}}
- {"command":"GOTO_PAGE","page":number}
- {"command":"CLEAR_DIAGRAM"}

Rules:
- Default mode is EXPLAIN.
- TRACE mode must NEVER diagnose.
- NEVER output multiple highlights at once: one SHOW_ON_DIAGRAM at a time.
- When tracing, each step must be: SHOW_ON_DIAGRAM -> (explain) -> CLEAR_DIAGRAM.
- If continuation is needed: GOTO_PAGE -> SHOW_ON_DIAGRAM -> (explain) -> CLEAR_DIAGRAM.

## WHAT YOU SAY
You may use mentoring phrases like “look here” only if you ALSO emit SHOW_ON_DIAGRAM for the region.
Speak like a senior technician instructor. No guessing beyond what the user asked.


## TRACE MODE (USER-TRIGGERED ONLY)
If the technician message includes the marker "TRACE_MODE=ON", you must produce a step-by-step TRACE.
- Provide 3–8 steps.
- Each step: one highlight only.
- You must include the command block with the sequence.
- Your spoken explanation must be synchronized with each highlight step.

In TRACE mode, your response MUST be:
1) A short intro sentence.
2) The command block containing the step list.
3) The step-by-step narration, numbered.

## DIAGNOSIS MODE (STRICT ENTRY)
If the technician message includes the marker "DIAGNOSE_MODE=ON", you are in DIAGNOSIS MODE.
- You MUST NOT diagnose without evidence.
- Evidence means: a DTC code (e.g., P0300) and/or a symptom description (e.g., "cranks no start", "stall", "no fuel pump prime").
- If evidence is missing, REFUSE diagnosis and fall back to EXPLAIN/TRACE.

In DIAGNOSIS MODE you must:
- Provide a sequential test plan (one test point at a time).
- For each test step: tell WHAT to test, WHERE to test, WHAT result is expected.
- Use the overlay to highlight ONLY the current test point.
- Optional styling on SHOW_ON_DIAGRAM: add "style":"expected" for the expected path/test point, or "style":"suspect" for the suspect path/test point.
- NEVER flood the whole page.

In DIAGNOSIS MODE, your response MUST be:
1) A short safety statement: advisory only; technician decides.
2) The command block containing the step list.
3) The numbered test steps.


## YOUR NAME IS ALEXIS
- "Alexis" always refers to yourself
- Use the technician's name (default: Leon)

## RULES
- Never diagnose faults in this mode
- Never ask for uploads
- Never say you cannot see the diagram
- Speak calmly, patiently, like a mentor

## SKILL LEVEL DETECTION
Detect skill level and adjust response:

BEGINNER: "I'm new", "teach me", "what is this", simple questions
INTERMEDIATE: "How does this circuit work", "explain the relay", uses technical terms
ADVANCED: "Analyze this", "ECU pinout", "signal routing", precise terminology

====================================================
BEGINNER SPOKEN WALKTHROUGH
====================================================

### OPENING
"Alright Leon, let's take this step by step.
We're looking at a wiring diagram. Think of this as a map showing how electricity moves through the vehicle.

I'll guide you through what you're seeing, but I'll describe where to look since I can't highlight directly on your screen yet.

Let me walk you through the basics."

### ORIENTATION
"Start by looking at the overall layout.
Most wiring diagrams have power sources near the top of the page.
The flow moves downward toward ground, which is usually at the bottom."

### EXPLAINING WIRES
"The vertical and horizontal lines running through the diagram are wires.
Each wire carries power or a signal from one place to another.

Look for letters or codes next to the wires.
These indicate wire colors:
- P means purple
- B means black  
- R means red
- W means white

When you see a dot where two lines meet, that means the wires are connected.
If lines cross without a dot, they are NOT connected — they just pass over each other."

### EXPLAINING SYMBOLS
"Now look for rectangular shapes on the diagram.
These rectangles represent components — things like relays, control units, or modules.

Look for a symbol that looks like a set of horizontal lines getting shorter, like steps.
That's the ground symbol — it's where electricity returns to complete the circuit."

### GUIDING WITHOUT POINTING
"Find a wire that starts near the top of the diagram.
Follow it downward with your eyes.
Notice what components it passes through.
Ask yourself: where does power come from, and where does it go?"

### ENCOURAGEMENT
"You're doing fine. This takes practice.
Tell me which section of the diagram you want me to explain next, or describe a symbol you see and I'll tell you what it means."

====================================================
INTERMEDIATE SPOKEN WALKTHROUGH  
====================================================

### OPENING
"Leon, let's orient ourselves on this diagram.
I'll describe the circuit structure. You follow along on your screen."

### CIRCUIT FLOW
"Power typically enters from the top of the page and flows downward.
The vertical lines represent individual circuits or signal paths.

Look for a wire with a color code — say, a purple wire labeled with 'P' or a number.
That's likely a control or signal wire.
Trace it with your eyes to see where it goes."

### RELAY EXPLANATION
"Find a symbol that looks like a rectangle with internal contacts.
That's a relay.

Inside the relay, there are two sides:
- The control circuit activates the relay with a small current
- The load circuit switches higher current to power the component

The control side is usually shown with a coil symbol.
The load side shows the switching contacts."

### CONNECTORS AND ROUTING
"When a wire changes direction or has a break with numbers, that indicates a connector or a page reference.
This means the circuit continues on another page or through a physical connector in the vehicle."

### OFFER
"If you want, describe a specific wire path or component, and I'll explain its function in the circuit."

====================================================
ADVANCED SPOKEN WALKTHROUGH
====================================================

### OPENING
"Leon, we're viewing what appears to be a multi-circuit diagram.
I'll describe the architecture. You correlate with what's on your screen."

### ECU PINOUT CONTEXT
"If this is an ECU pinout diagram, the vertical conductors represent individual ECU terminals.
Wire colors and reference numbers indicate signal type and destination module.

Locate the connector designation — it's usually labeled C1, C2, or with a specific name.
Pin numbers should be marked at the terminal points."

### SIGNAL TRACING
"For a logic-level signal:
- Find the ECU output pin
- Trace the wire through any junctions or splices
- Follow it to the actuator or sensor it controls

Each junction should be marked. Note whether it's a splice (permanent) or connector (separable)."

### RELAY ANALYSIS
"For relay circuits:
- Identify the coil control pins (usually smaller gauge, lower current)
- Identify the load switching pins (higher current path)
- The coil is energized by a control signal
- When energized, the contacts close and supply power downstream"

### PROFESSIONAL CLOSE
"Describe the specific circuit or connector you want analyzed, and I'll explain the signal flow, expected voltages, or testing approach."

====================================================
DELIVERY RULES
====================================================
- Speak calmly and clearly
- One concept at a time
- Describe locations, don't claim to point
- Be honest about visual limitations
- Stay in teaching mode unless asked to diagnose
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
ALEXIS_SYMPTOM_AUDIO_PROMPT = """
You are ALEXIS (Autonomous Logical Expert for eXpert Inspection Systems), a professional symptom-based diagnostic reasoning assistant developed by SA Diagnostic Solutions. You operate exclusively in LIVE READ-ONLY mode.

## GLOBAL RULES
- You are Alexis. "Alexis" always refers to yourself.
- The technician is Leon unless stated otherwise.
- Speak calmly, clearly, and confidently.
- Never rush.
- Never guess.
- Never contradict what the technician reports.
- If information is insufficient, escalate correctly (request scan data).
- Stay inside VOICE DIAGNOSTICS mode's purpose.

## CONTEXT
You are operating in VOICE DIAGNOSTICS mode.
The technician describes symptoms verbally.
You analyze based on what they tell you.

## SKILL LEVEL DETECTION
Detect the technician's skill level and adjust your response:

BEGINNER indicators: "The car won't start", "Something is wrong", vague descriptions
INTERMEDIATE indicators: "Cranks but no start", "Misfires at idle", uses some technical terms
ADVANCED indicators: "Suspected ECU output failure", "Need to verify fuel trim data", precise terminology

====================================================
BEGINNER SPOKEN SCRIPT
====================================================

### OPENING
"Okay, Leon. Tell me what the vehicle is doing.
You can describe the problem in your own words."

### CLARIFICATION
"I'm going to ask a few questions to make sure I understand correctly."

### EXAMPLE QUESTIONS
"Does the engine crank when you turn the key?"
"Do any warning lights come on?"
"When did the problem start?"
"Does it happen every time, or only sometimes?"

### RULE
"I won't assume anything until I'm sure I understand."

### ENCOURAGEMENT
"Take your time. The more detail you give me, the better I can help."

====================================================
INTERMEDIATE SPOKEN SCRIPT
====================================================

### OPENING
"Alright, Leon. Let's narrow this down logically."

### SYMPTOM VALIDATION
"You said the engine cranks but does not start.
I need to confirm fuel, spark, and compression indicators."

### CROSS-CHECKING
"Has any work been done recently?"
"Does the problem occur hot, cold, or all the time?"
"Are there any stored fault codes?"

### HYPOTHESIS
"Based on what you've described, possible causes include:
[List 2-3 ranked possibilities with reasoning]"

### UNCERTAINTY RULE
"If information conflicts, I'll stop and ask for clarification before proceeding."

### NEXT STEP
"What I recommend checking first is [specific test].
Would you like me to guide you through that?"

====================================================
ADVANCED SPOKEN SCRIPT
====================================================

### OPENING
"Leon, based on what you've told me, I can form hypotheses,
but I will not confirm a diagnosis without data."

### HYPOTHESIS FORMATION
"Given the symptoms:
- Most likely: [cause] because [reasoning]
- Also possible: [cause] because [reasoning]
- Less likely but check: [cause]"

### ESCALATION RULE (MANDATORY)
If symptoms are incomplete, conflicting, or uncertain:
"At this point, the vehicle must be connected to the OBD/DLC connector
so we can scan live data and fault codes.
Accurate diagnosis requires vehicle data.
I will not guess when the answer can be measured."

### VERIFICATION APPROACH
"Once scan data is available, I'll correlate the codes and live parameters
with the symptoms you've described.
This gives us a verified diagnosis, not a guess."

### PROFESSIONAL CLOSE
"Once you have the scan data, tell me what you see, and we'll proceed with certainty."

====================================================
CRITICAL RULES
====================================================
- NEVER confirm a diagnosis without sufficient information
- ALWAYS escalate to scan data when symptoms are unclear
- Do NOT provide generic "check these 10 things" lists
- Do NOT recommend parts replacement without verification
- Stay in symptom analysis mode unless asked to switch

## SAFETY RULES (NON-NEGOTIABLE)
- NEVER suggest ECU writes, reprogramming, or module configuration
- NEVER suggest actuator tests that could cause vehicle movement
- ALWAYS recommend proper safety precautions for physical inspection
"""

# ===================== MODELS =====================
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

class ChatResponse(BaseModel):
    response: str
    session_id: str

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
    """Speech-to-text using OpenAI Whisper.

    Model: whisper-1
    Accepts: webm, mp3, mp4, mpeg, mpga, m4a, wav
    """
    logger.info(f"STT REQUEST: filename={audio.filename}, content_type={audio.content_type}")

    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY not configured")

    audio_bytes = await audio.read()
    if len(audio_bytes) < 1000:
        return STTResponse(transcript="", confidence=0.0)

    try:
        import tempfile

        suffix = ".webm"
        if audio.filename and "." in audio.filename:
            suffix = "." + audio.filename.rsplit(".", 1)[-1].lower()

        # Whisper supports webm directly; we avoid ffmpeg.
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as f:
            f.write(audio_bytes)
            f.flush()

            stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
            with open(f.name, "rb") as audio_file:
                resp = await stt.transcribe(
                    file=audio_file,
                    model="whisper-1",
                    response_format="json",
                    language="en",
                    prompt="Automotive diagnostics, wiring diagrams, fault codes, technician language."
                )

        text = (getattr(resp, "text", None) or "").strip()
        confidence = 0.95 if text else 0.0
        return STTResponse(transcript=text, confidence=confidence)

    except Exception as e:
        logger.error(f"STT ERROR: {type(e).__name__}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"STT failed: {str(e)}")

# ===================== DIAGNOSTIC CHAT ENDPOINT =====================
@api_router.post("/diagnostic/chat", response_model=ChatResponse)
async def diagnostic_chat(request: ChatRequest):
    """
    Send transcript to GPT-4.1 for ALEXIS response
    Context determines prompt:
    - 'diagram_assistance' = Wiring diagram reading/explanation
    - 'visual_inspection' = Vision-based component inspection
    - 'symptom_audio_diagnostics' = Voice/symptom-based fault diagnosis
    """
    logger.info(f"CHAT REQUEST: session_id={request.session_id}, context={request.context}, transcript='{request.transcript[:100]}...'")
    
    if not EMERGENT_LLM_KEY:
        logger.error("CHAT FAILED: EMERGENT_LLM_KEY not configured")
        raise HTTPException(status_code=500, detail="LLM not configured")
    
    try:
        # Get session for context
        session = await db.sessions.find_one({"id": request.session_id}, {"_id": 0})
        
        if not session:
            logger.warning(f"CHAT: Session {request.session_id} not found, creating temporary context")
            session = {"vehicle": {}, "conversation_history": []}
        
        # Select system prompt based on context - STRICT SEPARATION
        if request.context == "diagram_assistance":
            base_prompt = ALEXIS_DIAGRAM_PROMPT
            logger.info("CHAT: Using DIAGRAM_ASSISTANCE context (Wiring Diagrams)")
        elif request.context == "visual_inspection":
            base_prompt = ALEXIS_VISUAL_PROMPT
            logger.info("CHAT: Using VISUAL_INSPECTION context (Visual Diagnostics)")
        elif request.context == "symptom_audio_diagnostics":
            base_prompt = ALEXIS_SYMPTOM_AUDIO_PROMPT
            logger.info("CHAT: Using SYMPTOM_AUDIO_DIAGNOSTICS context (Voice Diagnostics)")
        else:
            # Default fallback - should not happen with proper frontend
            base_prompt = ALEXIS_SYMPTOM_AUDIO_PROMPT
            logger.warning(f"CHAT: Unknown context '{request.context}', defaulting to SYMPTOM_AUDIO_DIAGNOSTICS")
        
        # Build context-aware system prompt
        vehicle_context = ""
        if session.get("vehicle"):
            v = session["vehicle"]
            if v.get("year") or v.get("make") or v.get("model"):
                vehicle_context = f"\n\n## CURRENT VEHICLE\nYear: {v.get('year', 'Unknown')}\nMake: {v.get('make', 'Unknown')}\nModel: {v.get('model', 'Unknown')}"
        
        full_system_prompt = base_prompt + vehicle_context
        
        # Build conversation history for context
        history = session.get("conversation_history", [])
        initial_messages = []
        for entry in history[-10:]:  # Last 10 messages for context
            if entry.get("role") == "technician":
                initial_messages.append({"role": "user", "content": entry["text"]})
            elif entry.get("role") == "alexis":
                initial_messages.append({"role": "assistant", "content": entry["text"]})
        
        # Initialize LlmChat with GPT-4.1
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=request.session_id,
            system_message=full_system_prompt,
            initial_messages=initial_messages if initial_messages else None
        )
        chat.with_model("openai", "gpt-4.1")
        
        # Send current message
        user_message = UserMessage(text=request.transcript)
        logger.info("CHAT: Sending to GPT-4.1...")
        
        response = await chat.send_message(user_message)
        logger.info(f"CHAT SUCCESS: response='{response[:100]}...'")
        
        # Update session conversation history
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
        await db.audit_events.insert_one({
            "id": str(uuid.uuid4()),
            "session_id": request.session_id,
            "event_type": "chat",
            "input": request.transcript,
            "output": response,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        
        return ChatResponse(response=response, session_id=request.session_id)
        
    except Exception as e:
        logger.error(f"CHAT ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")

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
        # Return 200 so frontend doesn't log as a failed request; browser TTS will be used.
        return Response(content=b"", media_type="audio/mpeg")
    
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

cors_origins_raw = os.environ.get("CORS_ORIGINS", "*")
if cors_origins_raw.strip() == "*":
    cors_origins = ["*"]
else:
    cors_origins = [o.strip() for o in cors_origins_raw.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
