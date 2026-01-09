# ALEXIS Diagnostic Platform - Product Requirements Document

## Original Problem Statement
Build a pixel-perfect clone of an automotive diagnostics platform with an AI assistant named **ALEXIS** (Autonomous Logical Expert for eXpert Inspection Systems). The platform must:
- Operate in **LIVE READ-ONLY** mode (no ECU writes or unsafe actions)
- Use **GPT-4.1** for diagnostic reasoning
- Use **Azure Speech Services** (Ava voice) for STT/TTS
- Follow the **ALEXIS Diagnostic Standard v1.0** for all AI interactions

## User Personas
- **Automotive Technicians**: Skilled professionals seeking collaborative diagnostic assistance
- **Shop Owners**: Looking to improve diagnostic efficiency and reduce unnecessary part replacements

## Core Requirements

### Authentication & Sessions
- [x] `POST /api/auth/login` - Simple login (name, email, no password for DEV)
- [x] `POST /api/session/start` - Creates LIVE session with rules_version=ALEXIS_DS_v1.0
- [ ] Login page UI integration (currently uses automatic session on Wiring Upload page)

### ALEXIS AI Integration
- [x] `POST /api/diagnostic/chat` - GPT-4.1 diagnostic reasoning with ALEXIS Standard system prompt
- [x] ALEXIS responds with Assessment, Next Step, Reasoning, Expected Result format
- [x] Conversation history persisted to MongoDB
- [x] Audit logging for all interactions

### Voice Integration
- [x] `POST /api/stt` - Azure Speech-to-Text endpoint (ready, awaiting valid key)
- [x] `POST /api/tts` - Azure Text-to-Speech endpoint with Ava voice
- [x] Browser speech synthesis fallback when Azure unavailable
- [ ] Valid Azure Speech key required for Azure TTS

### Frontend Pages
- [x] Wiring PDF Upload page - LIVE with voice/text chat, PDF viewer working
- [ ] Voice Diagnostics page - needs wiring to backend
- [ ] Visual Diagnostics page - needs wiring to backend
- [ ] Dashboard - UI complete, needs backend data
- [ ] Devices - UI complete, needs backend
- [ ] Diagnostic Console - UI complete, needs backend

## PDF Viewer (Fixed January 4, 2026)
- Worker loaded from CDN: `//unpkg.com/pdfjs-dist@5.4.296/build/pdf.worker.min.mjs`
- File object passed directly to `<Document file={selectedFile} />`
- CSS imports: `react-pdf/dist/Page/AnnotationLayer.css`, `react-pdf/dist/Page/TextLayer.css`
- Features working: render, scroll, zoom (+/- 25% steps), page navigation
- Layout: 60/40 split, single vertical scroll, clean OEM-grade appearance

## Architecture

### Backend (FastAPI)
```
/app/backend/
├── server.py          # All API endpoints
├── .env               # Configuration (MONGO_URL, EMERGENT_LLM_KEY, AZURE_SPEECH_*)
└── requirements.txt   # Dependencies
```

### Frontend (React)
```
/app/frontend/
├── src/
│   ├── layouts/AppLayout.jsx     # Main shell with sidebar
│   └── pages/
│       └── wiring-diagrams/
│           └── WiringUploadPage.jsx  # LIVE voice/text chat
```

### Database (MongoDB)
- `technicians` - User records
- `sessions` - Diagnostic sessions with conversation history
- `audit_events` - All AI interactions logged

## API Endpoints

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/auth/login` | POST | ✅ LIVE | Returns technician_id, token |
| `/api/session/start` | POST | ✅ LIVE | Returns session_id, live=true, rules_version |
| `/api/diagnostic/chat` | POST | ✅ LIVE | GPT-4.1 diagnostic reasoning |
| `/api/stt` | POST | ⚠️ Needs Key | Azure STT endpoint |
| `/api/tts` | POST | ⚠️ Needs Key | Azure TTS (Ava), browser fallback |

## Current Status

### What's Implemented (January 4, 2026)
1. ✅ Backend API endpoints for auth, session, diagnostic chat, STT, TTS
2. ✅ GPT-4.1 integration with ALEXIS Diagnostic Standard system prompt
3. ✅ Wiring PDF Upload page wired to live backend
4. ✅ Browser speech synthesis fallback for TTS
5. ✅ MongoDB persistence for sessions, conversations, audit logs
6. ✅ LIVE READ-ONLY mode enforced

### Known Issues
1. ⚠️ Azure Speech key returns 401 - needs valid key from user
2. ⚠️ Other pages (Voice/Visual Diagnostics) still use mock data

## Upcoming Tasks
1. **P0**: Get valid Azure Speech key from user for TTS
2. **P1**: Wire Voice Diagnostics page to backend
3. **P1**: Wire Visual Diagnostics page to backend
4. **P2**: Implement Login page UI with ALEXIS Standard acceptance
5. **P2**: Add Devices and Diagnostic Console backend endpoints

## Future/Backlog
- Stripe payment flow for ADVANCED tier
- Admin UI for session audit and plugin management
- OEM Plugin Architecture with signature verification
- Generate ALEXIS_Diagnostic_Standard_v1.0.pdf document

## ALEXIS Diagnostic Standard v1.0 (Summary)
- **Calm, precise, respectful** - Never condescending
- **Evidence-based reasoning** - Not a parts cannon
- **Verify fundamentals first** - Power, ground, communications
- **Structured responses** - Assessment, Next Step, Reasoning, Expected Result
- **Safety first** - No ECU writes, no unsafe actuator commands

---
*Last Updated: January 4, 2026*
