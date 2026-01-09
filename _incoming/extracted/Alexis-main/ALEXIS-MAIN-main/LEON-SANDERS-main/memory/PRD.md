# ALEXIS Diagnostic Platform - Product Requirements Document

## Original Problem Statement
Install and validate an automotive diagnostics platform from a zip file. The platform features:
- ALEXIS (Autonomous Logical Expert for eXpert Inspection Systems) AI assistant
- LIVE READ-ONLY mode for safe diagnostic operations
- GPT-4.1 integration for diagnostic reasoning
- Voice/text input across all diagnostic pages

## User Personas
- **Automotive Technicians**: Skilled professionals seeking collaborative diagnostic assistance
- **Shop Owners**: Looking to improve diagnostic efficiency and reduce unnecessary part replacements

## Core Requirements (Implemented)

### Authentication & Sessions
- [x] `POST /api/auth/login` - Simple login (name, email)
- [x] `POST /api/session/start` - Creates LIVE session with rules_version=ALEXIS_DS_v1.0

### ALEXIS AI Integration
- [x] `POST /api/diagnostic/chat` - GPT-4.1 diagnostic reasoning with context-specific prompts
- [x] Three distinct contexts: diagram_assistance, visual_inspection, symptom_audio_diagnostics
- [x] Conversation history persisted to MongoDB
- [x] Audit logging for all interactions

### Voice Integration
- [x] `POST /api/stt` - Azure Speech-to-Text endpoint (requires Azure key)
- [x] `POST /api/tts` - Azure Text-to-Speech endpoint (requires Azure key)
- [x] Browser speech synthesis fallback when Azure unavailable

### Frontend Pages
- [x] Dashboard - Main navigation hub with all diagnostic features
- [x] Voice Diagnostics - Symptom-based fault analysis with ALEXIS
- [x] Visual Diagnostics - Camera/image-based component inspection
- [x] Wiring Diagrams - PDF viewer with ALEXIS diagram assistance
- [x] About ALEXIS - System overview page

## What's Been Implemented (January 4, 2026)
1. ✅ Full application installed from Leon-Sanders-main.final.zip
2. ✅ Backend syntax error fixed (unterminated string literal in ALEXIS_DIAGRAM_PROMPT)
3. ✅ EMERGENT_LLM_KEY configured for GPT-4.1 integration
4. ✅ All backend API endpoints working (auth, session, chat, stt, tts)
5. ✅ All frontend pages rendering with correct branding and layout
6. ✅ Context-specific ALEXIS prompts for each diagnostic mode
7. ✅ Text-based conversation flow working across all pages
8. ✅ Browser speech synthesis fallback for TTS

## Testing Results
- Backend: 100% (8/8 tests passed)
- Frontend: 100% (15/15 tests passed)

## Architecture

### Backend (FastAPI)
```
/app/backend/
├── server.py          # All API endpoints + ALEXIS system prompts
├── .env               # MONGO_URL, DB_NAME, EMERGENT_LLM_KEY
└── requirements.txt   # Dependencies
```

### Frontend (React)
```
/app/frontend/src/
├── layouts/AppLayout.jsx            # Main shell with sidebar
├── pages/
│   ├── dashboard/DashboardPage.jsx
│   ├── voice-diagnostics/VoiceDiagnosticsPage.jsx
│   ├── visual-diagnostics/VisualDiagnosticsPage.jsx
│   ├── wiring-diagrams/
│   │   ├── WiringDiagramsPage.jsx
│   │   └── WiringUploadPage.jsx
│   └── about/AboutAlexisPage.jsx
```

## Prioritized Backlog

### P0 (Critical)
- Azure Speech keys for production TTS/STT (currently using browser fallback)

### P1 (Important)
- Implement real image analysis for Visual Diagnostics
- Add vehicle VIN lookup integration

### P2 (Nice to Have)
- Stripe payment flow for ADVANCED tier
- Admin UI for session audit
- OEM Plugin Architecture

---
*Last Updated: January 4, 2026*
