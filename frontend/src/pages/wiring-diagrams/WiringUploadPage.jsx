import React, { useState, useRef, useEffect, useCallback } from "react";
import WiringDiagramTeachingController from "@/components/WiringDiagramTeachingController";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Mic, MicOff, Volume2, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";

// Worker path (Emergent / CRA-safe)
// Served from /public to avoid module resolution issues.
pdfjs.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.min.js`;

const API_URL = process.env.REACT_APP_BACKEND_URL;
import TrainingModePanel from "@/pages/wiring-diagrams/TrainingModePanel";


// Context for this page - DIAGRAM ASSISTANCE, not fault diagnosis
const PAGE_CONTEXT = "diagram_assistance";

const WiringUploadPage = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [pdfError, setPdfError] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [technicianTranscript, setTechnicianTranscript] = useState("");
  const [conversation, setConversation] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [status, setStatus] = useState("Initializing...");
  const [sttError, setSttError] = useState(null);
  const [micReady, setMicReady] = useState(false);
  const [traceMode, setTraceMode] = useState(false);
  const traceRunnerRef = useRef({ running: false, cancel: false });
  const [diagnoseMode, setDiagnoseMode] = useState(false);


  const [liveMode, setLiveMode] = useState(false);
  const liveWsRef = useRef(null);
  const liveQueueRef = useRef([]);
  const [trainingMode, setTrainingMode] = useState(false);
  const [trainingScenario, setTrainingScenario] = useState(null);

  const liveProcessingRef = useRef(false);


  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioRef = useRef(null);
  const conversationEndRef = useRef(null);
  const teachingRef = useRef(null);

  // Pre-load browser voices for ALEXIS female voice selection
  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        console.log('Available voices:', voices.map(v => v.name).join(', '));
      }
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  // Auto-scroll conversation
  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation]);


  // Diagram region selection (SCREEN/DOM pixels) -> immediate ALEXIS explain
  const pageLayerRef = useRef(null);
  const [selection, setSelection] = useState(null);

  const handleDiagramMouseUp = (e) => {
    if (!pageLayerRef.current || !selectedFile || !sessionId) return;

    const rect = pageLayerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const bounds = {
      x: Math.max(0, Math.round(x - 80)),
      y: Math.max(0, Math.round(y - 45)),
      width: 160,
      height: 90,
      page: currentPage,
    };

    setSelection(bounds);

    // Local highlight (pulse)
    window.dispatchEvent(
      new CustomEvent("ALEXIS_DIAGRAM_COMMAND", {
        detail: {
          command: "SHOW_ON_DIAGRAM",
          page: currentPage,
          bounds,
        },
      })
    );

    // Immediate explanation (EXPLAIN default)
    sendToAlexis(
      `Explain what is happening in the selected region. Page ${currentPage}. Bounds: x=${bounds.x}, y=${bounds.y}, w=${bounds.width}, h=${bounds.height}.`
    );
  };

  // Initialize session and arm microphone on mount
  useEffect(() => {
    initSession();
    armMicrophone();
  }, []);

  // Arm microphone - request permission immediately
  const armMicrophone = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicReady(true);
    } catch (err) {
      setMicReady(false);
      setSttError("Microphone access denied. Please allow microphone permission.");
    }
  };

  // ===================== LIVE DATA MODE (SIMULATED via WS) =====================
  const connectLiveStream = () => {
    if (liveWsRef.current) return;

    try {
      const wsUrl = `${API_URL.replace(/^http/, "ws")}/api/live/ws`;
      const ws = new WebSocket(wsUrl);
      liveWsRef.current = ws;

      ws.onopen = () => {
        setLiveMode(true);
        setConversation((prev) => [
          ...prev,
          { role: "alexis", text: "LIVE DATA MODE: connected (simulated). I’ll evaluate one signal at a time." },
        ]);
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          // Enqueue one PID at a time
          liveQueueRef.current.push(msg);
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        liveWsRef.current = null;
        setLiveMode(false);
      };

      ws.onerror = () => {
        liveWsRef.current = null;
        setLiveMode(false);
        setConversation((prev) => [
          ...prev,
          { role: "alexis", text: "LIVE DATA MODE unavailable. Falling back to Diagnosis Bridge." },
        ]);
      };
    } catch {
      setConversation((prev) => [
        ...prev,
        { role: "alexis", text: "LIVE DATA MODE unavailable. Falling back to Diagnosis Bridge." },
      ]);
    }
  };

  const disconnectLiveStream = () => {
    try {
      if (liveWsRef.current) liveWsRef.current.close();
    } catch {
      // ignore
    }
    liveWsRef.current = null;
    setLiveMode(false);
    liveQueueRef.current = [];
  };

  const pidToExpected = (pid, value) => {
    // Minimal expectations for demo (technician-first, non-diagnostic)
    switch (pid) {
      case "BATTERY_VOLTAGE":
        return { expected: ">= 12.2 V KOEO", interpretation: value >= 12.2 ? "pass" : "low" };
      case "RPM":
        return { expected: "~650–850 rpm at warm idle", interpretation: value >= 500 ? "pass" : "low" };
      case "IGNITION_STATUS":
        return { expected: "ON during testing", interpretation: value === "ON" ? "pass" : "off" };
      case "FUEL_RAIL_PRESSURE":
        return { expected: "varies by system; should be stable for the operating mode", interpretation: "inconclusive" };
      case "INJECTOR_PULSE":
        return { expected: ">0 ms when commanding fuel", interpretation: value > 0 ? "pass" : "no_pulse" };
      case "MAF":
        return { expected: "~2–7 g/s idle (engine-dependent)", interpretation: "inconclusive" };
      case "ECT":
        return { expected: "~70–105 °C warmed up", interpretation: "inconclusive" };
      case "TPS":
        return { expected: "~0–10% at closed throttle", interpretation: "inconclusive" };
      default:
        return { expected: "—", interpretation: "inconclusive" };
    }
  };

  const pidToTestPoint = useCallback((pid) => {
    // SCREEN/DOM pixel demo mapping (center of page) – can be calibrated later
    // One test point at a time.
    const base = { x: 220, y: 220, width: 180, height: 90, page: currentPage };
    const map = {
      BATTERY_VOLTAGE: { ...base, x: 180, y: 160 },
      RPM: { ...base, x: 260, y: 240 },
      IGNITION_STATUS: { ...base, x: 210, y: 200 },
      INJECTOR_PULSE: { ...base, x: 320, y: 260 },
      FUEL_RAIL_PRESSURE: { ...base, x: 360, y: 210 },
      MAF: { ...base, x: 280, y: 300 },
      ECT: { ...base, x: 200, y: 320 },
      TPS: { ...base, x: 340, y: 320 },
    };
    return map[pid] || base;
  // (deps intentionally stable)

  }, [currentPage]);

  useEffect(() => {
    if (!liveMode) return;

    const tick = async () => {
      if (liveProcessingRef.current) return;
      if (!liveQueueRef.current.length) return;

      liveProcessingRef.current = true;
      try {
        const update = liveQueueRef.current.shift();
        const { pid, value, unit, timestamp } = update || {};
        if (!pid) return;

        const expectedInfo = pidToExpected(pid, value);
        const bounds = pidToTestPoint(pid);

        // Highlight one related test point
        window.dispatchEvent(
          new CustomEvent("ALEXIS_DIAGRAM_COMMAND", {
            detail: { command: "SHOW_ON_DIAGRAM", page: bounds.page, bounds },
          })
        );

        const msg = `LIVE DATA (${pid})\nExpected: ${expectedInfo.expected}\nActual: ${value}${unit ? " " + unit : ""}\nResult: ${expectedInfo.interpretation.toUpperCase()}\nTimestamp: ${timestamp}`;
        setConversation((prev) => [...prev, { role: "alexis", text: msg }]);
        await speakResponseWithPromise(
          `Live data ${pid}. Expected ${expectedInfo.expected}. Actual ${value} ${unit || ""}. Result ${expectedInfo.interpretation}.`
        );

        window.dispatchEvent(new CustomEvent("ALEXIS_DIAGRAM_COMMAND", { detail: { command: "CLEAR_DIAGRAM" } }));
      } finally {
        liveProcessingRef.current = false;
      }
    };

    const id = setInterval(tick, 650);
    return () => clearInterval(id);
  }, [liveMode, currentPage, pidToTestPoint]);

  const initSession = async () => {
    try {
      setStatus("Connecting...");
      const loginRes = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Technician", email: "tech@alexis.local" })
      });
      const loginData = await loginRes.json();

      const sessionRes = await fetch(`${API_URL}/api/session/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          technician_id: loginData.technician_id,
          vehicle_year: "",
          vehicle_make: "",
          vehicle_model: ""
        })
      });
      const sessionData = await sessionRes.json();

      if (sessionData.live) {
        setSessionId(sessionData.session_id);
        setStatus("LIVE - Diagram Assistance");
        
        // Initial state: viewer is ready. ALEXIS will auto-explain on click/trace/live requests.
        setConversation([]);
      } else {
        setStatus("Offline");
      }
    } catch (err) {
      console.error("Session init error:", err);
      setStatus("Connection Failed");
    }
  };

  // PDF handlers
  const handleFileChange = (event) => {
    if (trainingMode) return;
    const file = event.target.files?.[0];
    if (!file) return;
    setPdfError(null);
    setSelectedFile(file);
    setNumPages(null);
    setCurrentPage(1);
    setScale(1.0);
  };

  const onDocumentLoadSuccess = ({ numPages: pages }) => {
    setNumPages(pages);
    setPdfError(null);
  };

  const onDocumentLoadError = (error) => {
    console.error("PDF load error:", error);
    setPdfError("Failed to load PDF. Please try another file.");
  };

  const handleZoomIn = () => setScale((s) => Math.min(s + 0.25, 3.0));
  const handleZoomOut = () => setScale((s) => Math.max(s - 0.25, 0.5));
  const handlePrevPage = () => setCurrentPage((p) => Math.max(p - 1, 1));
  const handleNextPage = () => setCurrentPage((p) => Math.min(p + 1, numPages || 1));

  // Voice handlers with proper STT feedback
  const startRecording = async () => {
    if (!sessionId) {
      setSttError("Session not ready. Please wait.");
      return;
    }
    
    setSttError(null);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach(t => t.stop());
        await processAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setStatus("Listening... speak now");
    } catch (err) {
      console.error("Mic error:", err);
      setSttError("Could not access microphone. Check browser permissions.");
      setMicReady(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setStatus("Processing speech...");
    }
  };

  const toggleMic = () => isRecording ? stopRecording() : startRecording();

  const processAudio = async (audioBlob) => {
    setIsProcessing(true);
    setSttError(null);
    setStatus("Converting speech to text...");
    
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");
      
      const sttRes = await fetch(`${API_URL}/api/stt`, { method: "POST", body: formData });
      
      if (!sttRes.ok) {
        const errorData = await sttRes.json().catch(() => ({}));
        throw new Error(errorData.detail || `STT failed with status ${sttRes.status}`);
      }
      
      const sttData = await sttRes.json();
      
      if (!sttData.transcript || sttData.transcript.trim() === "") {
        setSttError("No speech detected. Please try again and speak clearly.");
        setStatus("LIVE - Diagram Assistance");
        setIsProcessing(false);
        return;
      }
      
      console.log("STT result:", sttData);
      setTechnicianTranscript(sttData.transcript);
      setStatus("Speech recognized. Sending to ALEXIS...");
      
      // Send to ALEXIS with diagram_assistance context
      await sendToAlexis(sttData.transcript);
      
    } catch (err) {
      console.error("STT error:", err);
      setSttError(`Speech recognition failed: ${err.message}`);
      setStatus("LIVE - Diagram Assistance");
    } finally {
      setIsProcessing(false);
    }
  };

  const extractAlexisCommands = (text) => {
    const match = text.match(/<ALEXIS_COMMANDS>([\s\S]*?)<\/ALEXIS_COMMANDS>/);
    if (!match) return null;
    try {
      return JSON.parse(match[1]);
    } catch {
      return null;
    }
  };

  const dispatchDiagramCommand = (cmd) => {
    if (!cmd || !cmd.command) return;
    window.dispatchEvent(new CustomEvent("ALEXIS_DIAGRAM_COMMAND", { detail: cmd }));
  };

  const extractTraceStepNarration = (narrationText) => {
    // Expect numbered lines like: 1) ... 2) ...
    const lines = (narrationText || "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const steps = [];
    for (const l of lines) {
      const m = l.match(/^\d+[\)|\.]\s+(.*)$/);
      if (m && m[1]) steps.push(m[1].trim());
    }
    return steps;
  };

  const speakResponseWithPromise = (text) => {
    setIsSpeaking(true);
    setStatus("TRACE MODE - Speaking...");
    const cleanText = (text || "").replace(/\*\*/g, "").replace(/\*/g, "").replace(/#/g, "");

    return new Promise((resolve) => {
      try {
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.rate = 0.95;
        utterance.pitch = 1.1;
        utterance.onend = () => {
          setIsSpeaking(false);
          resolve();
        };
        utterance.onerror = () => {
          setIsSpeaking(false);
          resolve();
        };
        window.speechSynthesis.speak(utterance);
      } catch {
        setIsSpeaking(false);
        resolve();
      }
    });
  };

  const runTraceCommands = async (commandsPayload, narrationText) => {
    if (!commandsPayload?.commands || !Array.isArray(commandsPayload.commands)) return;
    if (traceRunnerRef.current.running) return;

    const stepNarration = extractTraceStepNarration(narrationText);
    let stepIndex = 0;

    traceRunnerRef.current.running = true;
    traceRunnerRef.current.cancel = false;

    try {
      for (const cmd of commandsPayload.commands) {
        if (traceRunnerRef.current.cancel) break;

        if (cmd.command === "GOTO_PAGE") {
          dispatchDiagramCommand(cmd);
          await new Promise((r) => setTimeout(r, 900));
          continue;
        }

        if (cmd.command === "SHOW_ON_DIAGRAM") {
          dispatchDiagramCommand(cmd);

          const say = stepNarration[stepIndex] || "";
          stepIndex += 1;

          if (say) {
            await speakResponseWithPromise(say);
          } else {
            await new Promise((r) => setTimeout(r, 1200));
          }

          // one step = one glow, then clear
          dispatchDiagramCommand({ command: "CLEAR_DIAGRAM" });
          await new Promise((r) => setTimeout(r, 220));
          continue;
        }

        if (cmd.command === "CLEAR_DIAGRAM") {
          dispatchDiagramCommand(cmd);
          await new Promise((r) => setTimeout(r, 220));
        }
      }
    } finally {
      traceRunnerRef.current.running = false;
    }
  };

  // Send to ALEXIS with DIAGRAM ASSISTANCE context
  const sendToAlexis = async (text) => {
    if (!text.trim() || !sessionId) return;
    const isTraceRequest = text.includes("TRACE_MODE=ON") || traceMode;
    const isDiagnoseRequest = text.includes("DIAGNOSE_MODE=ON") || diagnoseMode;
    setIsProcessing(true);
    setSttError(null);

    const techMessage = { role: "technician", text: text.trim() };
    setConversation(prev => [...prev, techMessage]);

    try {
      setStatus("ALEXIS is analyzing...");
      
      const chatRes = await fetch(`${API_URL}/api/diagnostic/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          session_id: sessionId, 
          transcript: text.trim(),
          context: PAGE_CONTEXT  // "diagram_assistance" - NOT fault diagnosis
        })
      });

      if (!chatRes.ok) throw new Error("Chat failed");
      const chatData = await chatRes.json();

      const commandsPayload = extractAlexisCommands(chatData.response);
      const cleanedResponse = chatData.response.replace(/<ALEXIS_COMMANDS>[\s\S]*?<\/ALEXIS_COMMANDS>/, "").trim();

      const alexisMessage = { role: "alexis", text: cleanedResponse || chatData.response };
      setConversation((prev) => [...prev, alexisMessage]);
      setTechnicianTranscript("");

      if ((isTraceRequest || isDiagnoseRequest) && commandsPayload?.commands?.length) {
        setStatus(isDiagnoseRequest ? "DIAGNOSIS MODE..." : "TRACE MODE...");
        runTraceCommands(commandsPayload, cleanedResponse);
        setStatus("LIVE - Diagram Assistance");
      } else {
        setStatus("ALEXIS is speaking...");
        // Speak asynchronously so UI updates (chat bubble render) are not blocked
        speakResponse(cleanedResponse || chatData.response);
      }
    } catch (err) {
      console.error("Chat error:", err);
      setConversation(prev => [...prev, { role: "alexis", text: "Error: Could not get response. Please try again." }]);
      setStatus("LIVE - Diagram Assistance");
    } finally {
      setIsProcessing(false);
    }
  };

  const speakResponse = async (text) => {
    setIsSpeaking(true);
    const cleanText = text.replace(/\*\*/g, '').replace(/\*/g, '').replace(/#/g, '');
    
    try {
      const ttsRes = await fetch(`${API_URL}/api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, text })
      });

      if (ttsRes.ok) {
        const audioBlob = await ttsRes.blob();
        if (audioBlob.size > 100) {
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl);
          audio.onended = () => { 
            setIsSpeaking(false); 
            setStatus("LIVE - Diagram Assistance");
            URL.revokeObjectURL(audioUrl); 
          };
          audio.onerror = () => browserSpeak(cleanText);
          await audio.play();
          return;
        }
      }
      browserSpeak(cleanText);
    } catch {

/* trace helpers moved near sendToAlexis */

      browserSpeak(cleanText);
    }
  };

  const browserSpeak = (text) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1.1;
    
    const voices = window.speechSynthesis.getVoices();
    const femaleVoicePriority = [
      'Microsoft Ava Online', 'Microsoft Ava', 'Ava',
      'Microsoft Zira Online', 'Microsoft Zira', 'Zira',
      'Microsoft Jenny', 'Jenny',
      'Samantha', 'Karen', 'Victoria', 'Fiona', 'Moira',
      'Google US English Female', 'Google UK English Female',
      'Joanna', 'Kendra', 'Kimberly', 'Salli', 'Ivy'
    ];
    
    let selectedVoice = null;
    for (const targetName of femaleVoicePriority) {
      selectedVoice = voices.find(v => v.name.toLowerCase().includes(targetName.toLowerCase()));
      if (selectedVoice) break;
    }
    
    if (!selectedVoice && voices.length > 0) {
      selectedVoice = voices.find(v => v.name.toLowerCase().includes('female'));
      if (!selectedVoice) {
        selectedVoice = voices.find(v => v.lang.startsWith('en') && !v.name.toLowerCase().includes('male'));
      }
    }
    
    if (selectedVoice) utterance.voice = selectedVoice;
    
    utterance.onend = () => { 
      setIsSpeaking(false); 
      setStatus("LIVE - Diagram Assistance");
    };
    utterance.onerror = () => { 
      setIsSpeaking(false); 
      setStatus("LIVE - Diagram Assistance");
    };
    window.speechSynthesis.speak(utterance);
  };

  const handleSend = () => {
    const input = technicianTranscript.trim();
    if (!input) return;

    const lower = input.toLowerCase();

    // Trace mode activation (user-triggered only)
    if (lower.includes("trace this") || lower.includes("show current flow")) {
      setTraceMode(true);
      setDiagnoseMode(false);
      sendToAlexis(`TRACE_MODE=ON. ${input}`);
      return;
    }

    // Live data mode (simulated) - strict entry: requires live stream connection
    if (lower.includes("live data")) {
      connectLiveStream();
      setTechnicianTranscript("");
      return;
    }

    // Diagnosis mode activation (strict entry: requires dtc or symptom text)
    if (lower.includes("diagnose") || lower.includes("fault isolation") || lower.includes("test plan")) {
      const hasDtc = /\bp0\d{3}\b/i.test(input) || /\bu0\d{3}\b/i.test(input) || /\bc0\d{3}\b/i.test(input);
      const hasSymptom = /(no start|crank|stall|misfire|no fuel|no spark|rough idle|overheat|no power|limp mode|won't start)/i.test(input);

      if (!hasDtc && !hasSymptom) {
        setConversation((prev) => [
          ...prev,
          {
            role: "alexis",
            text: "Diagnosis mode requires evidence (a DTC code or a symptom description). Tell me the DTC(s) or the exact symptom and I’ll build a test plan."
          }
        ]);
        setTechnicianTranscript("");
        return;
      }

      setDiagnoseMode(true);
      setTraceMode(false);
      sendToAlexis(`DIAGNOSE_MODE=ON. Evidence: ${input}`);
      return;
    }

    // Stop trace / live / diagnosis
    if (lower === "stop" || lower.includes("stop trace") || lower.includes("stop live")) {
      if (liveMode) disconnectLiveStream();
      setDiagnoseMode(false);
      setTraceMode(false);
      traceRunnerRef.current.cancel = true;
      window.dispatchEvent(new CustomEvent("ALEXIS_DIAGRAM_COMMAND", { detail: { command: "CLEAR_DIAGRAM" } }));
      setTechnicianTranscript("");
      return;
    }

    // Default explain
    sendToAlexis(input);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden text-slate-100">
      {/* Compact Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b border-slate-700/50 bg-slate-900/50">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold tracking-wide" data-testid="wiring-upload-title">Wiring Diagram Viewer</h1>
          <span
            className={`px-3 py-1 rounded text-xs font-bold uppercase tracking-wider ${
              sessionId
                ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40'
            }`}
            data-testid="wiring-upload-status"
          >
            {status}
          </span>
          {isSpeaking && <Volume2 className="h-4 w-4 text-cyan-400 animate-pulse" />}
          {isRecording && <span className="text-red-400 text-xs animate-pulse">● REC</span>}
        </div>
        {/* Mic Ready Indicator */}
        <div className="flex items-center gap-2 text-xs">
          {micReady ? (
            <span className="text-green-400">● Mic Ready</span>
          ) : (
            <span className="text-yellow-400">○ Mic Not Armed</span>
          )}
        </div>
      </div>

      {/* STT Error Banner */}
      {sttError && (
        <div className="flex-shrink-0 px-6 py-2 bg-red-900/30 border-b border-red-800/50 flex items-center gap-2" data-testid="wiring-upload-error-banner">
          <AlertCircle className="h-4 w-4 text-red-400" />
          <span className="text-sm text-red-300">{sttError}</span>
          <button onClick={() => setSttError(null)} className="ml-auto text-red-400 hover:text-red-300 text-xs">Dismiss</button>
        </div>
      )}

      {/* Main Content - Fixed 60/40 Split */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* LEFT PANEL: PDF Viewer (60%) */}
        <div className="w-[60%] flex flex-col border-r border-slate-700/50 bg-slate-950">
          {/* PDF Toolbar */}
          <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900/80">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => document.getElementById("pdf-input").click()}
                data-testid="wiring-upload-select-pdf-button"
                className="h-9 px-4 bg-slate-800 border-slate-600 text-slate-100 hover:bg-slate-700 text-xs uppercase tracking-wider font-semibold"
              >
                Select PDF
              </Button>
              <input
                id="pdf-input"
                type="file"
                data-testid="wiring-upload-file-input"
                accept=".pdf"
                className="hidden"
                onChange={handleFileChange}
              />
              {selectedFile && (
                <span className="text-xs text-slate-400 truncate max-w-[200px]">{selectedFile.name}</span>
              )}
            </div>
            
            {/* Zoom & Page Controls */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-slate-800/80 rounded-lg p-1">
                <Button variant="ghost" size="sm" onClick={handleZoomOut} data-testid="wiring-upload-zoom-out" className="h-8 w-8 p-0 text-slate-300 hover:text-white hover:bg-slate-700">
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-xs text-slate-400 w-12 text-center" data-testid="wiring-upload-zoom-percent">{Math.round(scale * 100)}%</span>
                <Button variant="ghost" size="sm" onClick={handleZoomIn} data-testid="wiring-upload-zoom-in" className="h-8 w-8 p-0 text-slate-300 hover:text-white hover:bg-slate-700">
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </div>
              
              {numPages && (
                <div className="flex items-center gap-1 bg-slate-800/80 rounded-lg p-1">
                  <Button variant="ghost" size="sm" onClick={handlePrevPage} disabled={currentPage <= 1} data-testid="wiring-upload-prev-page" className="h-8 w-8 p-0 text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-30">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs text-slate-400 w-16 text-center" data-testid="wiring-upload-page-indicator">{currentPage} / {numPages}</span>
                  <Button variant="ghost" size="sm" onClick={handleNextPage} disabled={currentPage >= numPages} data-testid="wiring-upload-next-page" className="h-8 w-8 p-0 text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-30">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* PDF Display Area */}
          <div className="flex-1 overflow-auto bg-slate-950 p-4 relative" data-testid="wiring-upload-pdf-container">
            {pdfError ? (
              <div className="h-full flex items-center justify-center text-red-400 text-sm">{pdfError}</div>
            ) : selectedFile ? (
              <div className="flex justify-center">
                <Document
                  file={selectedFile}
                  onLoadSuccess={onDocumentLoadSuccess}
                  loading="Loading wiring diagram…"
                  error="Failed to load wiring diagram"
                >
                  <div
                    className="relative"
                    ref={pageLayerRef}
                    onMouseUp={handleDiagramMouseUp}
                    style={{ cursor: "crosshair" }}
                    data-testid="wiring-upload-pdf-page-layer"
                  >
                    <Page
                      pageNumber={currentPage}
                      scale={scale}
                      renderTextLayer={true}
                      renderAnnotationLayer={true}
                    />
                    <WiringDiagramTeachingController
                      totalPages={numPages}
                      setPageNumber={setCurrentPage}
                    />
                  </div>
                </Document>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-500" data-testid="wiring-upload-empty-state">
                <div className="mx-auto mb-4 h-16 w-16 rounded-2xl border border-slate-800 bg-slate-900/40 flex items-center justify-center">
                  <span className="sr-only">PDF</span>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-60">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M8 13h8" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M8 17h6" stroke="currentColor" strokeWidth="1.5"/>
                  </svg>
                </div>
                <p className="text-sm">Select a wiring diagram PDF to view</p>
                <p className="text-xs text-slate-600 mt-2">ALEXIS will help you understand the schematic</p>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL: ALEXIS Conversation (40%) */}
        <div className="w-[40%] flex flex-col bg-slate-900/50">
          {/* Panel Header with Context Indicator */}
          <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">ALEXIS - Diagram Assistant</h2>
              <p className="text-xs text-cyan-400/80 mt-0.5">Context: Schematic Reading & Explanation</p>
            </div>
            {/* Large Mic Button */}
            <Button
              variant="outline"
              onClick={toggleMic}
              disabled={isProcessing || !sessionId}
              data-testid="mic-button"
              className={`h-14 w-14 rounded-full p-0 transition-all ${
                isRecording 
                  ? 'bg-red-600 border-red-500 text-white animate-pulse scale-110' 
                  : micReady
                    ? 'bg-slate-800 border-green-500/50 text-green-400 hover:bg-slate-700 hover:text-green-300'
                    : 'bg-slate-800 border-slate-600 text-slate-400'
              } ${isProcessing ? 'opacity-50' : ''}`}
            >
              {isRecording ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </Button>
          </div>

          {/* Conversation Area */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4" data-testid="wiring-upload-conversation">
            {conversation.map((entry, idx) => (
              <div key={idx} className={`rounded-lg p-3 ${
                entry.role === "technician" 
                  ? 'bg-blue-900/30 border border-blue-800/50 ml-4' 
                  : 'bg-slate-800/50 border border-slate-700/50 mr-4'
              }`}>
                <p className={`text-[10px] uppercase tracking-wider font-semibold mb-1 ${
                  entry.role === "technician" ? 'text-blue-400' : 'text-cyan-400'
                }`}>
                  {entry.role === "technician" ? "You" : "ALEXIS"}
                </p>
                <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">{entry.text}</p>
              </div>
            ))}
            <div ref={conversationEndRef} />
          </div>

          {/* Input Area - Pinned Bottom */}
          <div className="flex-shrink-0 p-4 border-t border-slate-800 bg-slate-900/80">
            <div className="flex gap-2">
              <Textarea
                value={technicianTranscript}
                onChange={(e) => setTechnicianTranscript(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }}}
                placeholder={isRecording ? "Listening..." : "Ask about symbols, circuits, connectors, or pinouts..."}
                className="flex-1 min-h-[48px] max-h-[96px] resize-none bg-slate-950 border-slate-700 text-sm text-slate-100 placeholder:text-slate-500"
                data-testid="wiring-upload-transcript-input"
              />
              <Button
                onClick={handleSend}
                disabled={isProcessing || !technicianTranscript.trim() || !sessionId}
                className="h-12 px-6 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold uppercase tracking-wider text-xs disabled:opacity-40"
                data-testid="wiring-upload-send-button"
              >
                {isProcessing ? '...' : 'Send'}
              </Button>
            </div>
            <p className="text-[10px] text-slate-500 mt-2">
              Ask ALEXIS to explain symbols, trace circuits, or decode wire colors. For fault diagnosis, use the Voice Diagnostics page.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WiringUploadPage;
