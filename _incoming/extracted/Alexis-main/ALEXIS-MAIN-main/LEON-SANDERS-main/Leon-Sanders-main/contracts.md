# API Contracts for Wiring PDF Upload + ALEXIS (Phase 1)

This document defines the minimal backend contracts needed to make the **Wiring PDF Upload** page work with real voice (Azure STT) and real ALEXIS reasoning (OpenAI GPT‑4.1), while keeping the rest of the app unchanged.

---

## 1. Endpoints

### 1.1 POST `/api/wiring/transcribe`
**Purpose:** Convert technician speech (audio) to text using Azure Speech‑to‑Text.

**Request (multipart/form-data):**
- `file`: audio file (e.g. `audio/webm` or `audio/wav`), single channel, short utterances (~5–30s).

**Response (200):**
```json
{
  "transcript": "string"  // plain English transcription of the spoken input
}
```

**Error (4xx/5xx):**
```json
{
  "detail": "error description"
}
```

Notes:
- Backend will call **Azure Cognitive Services Speech** (Speech-to-Text) using the provided `centralus` key + endpoint.
- No session logic here; this is pure STT.

---

### 1.2 POST `/api/wiring/chat`
**Purpose:** Generate an ALEXIS diagnostic reasoning reply for the Wiring context using GPT‑4.1.

**Request (JSON):**
```json
{
  "session_id": "string",             // client-generated, used to preserve context
  "vehicle_context": {
    "vin": "string|null",
    "year": "string|null",
    "make": "string|null",
    "model": "string|null",
    "system": "string|null"          // e.g. "Engine", "ABS", "Body", "Network"
  },
  "pdf_context": {
    "file_name": "string|null",      // wiring PDF file name (for reference only in v1)
    "page": 123                       // current page number technician is viewing
  },
  "message": "string",               // technician free-text description or question
  "history": [                        // short conversation history, newest last
    {
      "role": "technician|alexis",
      "text": "string"
    }
  ]
}
```

**Response (200):**
```json
{
  "reply": "string",                 // ALEXIS textual response
  "debug": {
    "used_model": "string",         // e.g. "gpt-4.1"
    "tokens": {
      "prompt": 0,
      "completion": 0
    }
  }
}
```

Notes:
- Backend will call **OpenAI GPT‑4.1** via the Emergent integrations library and universal key.
- All ALEXIS behavior (sanity checks, hypothesis management, test selection, feedback loop) will be implemented in the system prompt and message shaping.
- In **Phase 1**, the backend does NOT parse the PDF — it only receives `file_name` and `page` as context strings.

---

## 2. Frontend Data Flow (Wiring PDF Upload)

### 2.1 Current mocked data to be replaced later

- `technicianTranscript` (textarea) – currently typed manually; in the future it will be **augmented** by `/api/wiring/transcribe` when the mic is used.
- `conversation` array – currently mocked by appending a hard-coded ALEXIS message; this will be replaced by `/api/wiring/chat`.

### 2.2 Planned wiring (Phase 1)

- **Mic button**:
  - On press: start recording audio via `MediaRecorder` (browser).
  - On stop: send audio blob to `/api/wiring/transcribe`.
  - Set `technicianTranscript` to returned `transcript`.

- **Send button**:
  - POST to `/api/wiring/chat` with:
    - `session_id`: a stable ID per wiring session (can be a UUID stored in component state).
    - `vehicle_context`: initially minimal or null; to be expanded later.
    - `pdf_context`: `file_name` and `currentPage` from React state.
    - `message`: current `technicianTranscript`.
    - `history`: current `conversation` mapped into `{role,text}` list.
  - Append technician + ALEXIS messages to `conversation` based on response.

No backend logic on file upload itself in this phase: PDFs are **not** sent to the backend yet.

---

## 3. Azure Speech (STT) Contract

- Config from environment (backend `.env`):
  - `AZURE_SPEECH_KEY`
  - `AZURE_SPEECH_REGION` (e.g. `centralus`)
  - `AZURE_SPEECH_ENDPOINT` (optional; if omitted, derive from region)

- STT will use Azure’s REST or SDK endpoint for short audio transcriptions.
- Language: initially `en-US`.

---

## 4. OpenAI GPT‑4.1 Contract

- Use Emergent integrations library with the **universal LLM key** (no raw OpenAI key in code).
- Model: `gpt-4.1` for chat.
- System prompt will encode:
  - Pre-diagnostic sanity checks
  - ECU expectation vs reality
  - Hypothesis management with confidence levels
  - Test selection logic & technician feedback loop
  - ALEXIS intelligence contract and tone rules.

---

## 5. Out of Scope (Phase 1)

- No PDF content upload or parsing on the backend.
- No Azure TTS (Ava) yet; voice output will be added in a later phase.
- No persistence of conversations in a database; everything is in-memory per session in the frontend for now.

This contract is intentionally minimal to keep implementation focused on **Wiring PDF Upload** first, without changing existing logos, colors, or global layout.
