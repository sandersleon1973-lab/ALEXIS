import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Mic, MicOff, Volume2, AlertCircle } from "lucide-react";

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Context for this page - SYMPTOM-BASED AUDIO DIAGNOSTICS
const PAGE_CONTEXT = "symptom_audio_diagnostics";

// Phase One: single-init session across React 18 StrictMode remounts
let voiceSessionInitPromise = null;
let voiceCachedSessionId = null;
let voiceGreetingSent = false;

const VoiceDiagnosticsPage = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [technicianTranscript, setTechnicianTranscript] = useState("");
  const [conversation, setConversation] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [initState, setInitState] = useState("INIT"); // INIT | LIVE | LISTENING | ANALYZING | SPEAKING | ERROR

  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [status, setStatus] = useState("Initializing...");
  const [sttError, setSttError] = useState(null);
  const [micReady, setMicReady] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const conversationEndRef = useRef(null);

  // Lockdown guards (component-local)
  const greetedRef = useRef(false);


  // Pre-load browser voices
  useEffect(() => {
    const loadVoices = () => window.speechSynthesis.getVoices();
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  // Auto-scroll conversation
  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation]);

  // Initialize session and arm microphone (single-init, StrictMode-safe)
  useEffect(() => {
    initSession();
    armMicrophone();
  }, []);

  const armMicrophone = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicReady(true);
    } catch (err) {
      setMicReady(false);
      const name = err?.name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        setSttError("Microphone permission blocked. Allow mic access in Chrome site settings.");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setSttError("No microphone device found. Connect a mic/headset and retry.");
      } else {
        setSttError("Microphone unavailable. Please check permissions and device.");
      }
    }
  };

  const initSession = async () => {
    try {
      setInitState("INIT");
      // If we already have a cached session, reuse it immediately
      if (voiceCachedSessionId) {
        setSessionId(voiceCachedSessionId);
        setStatus("LIVE - Symptom Diagnostics");
        setInitState("LIVE");
        if (!voiceGreetingSent && !greetedRef.current) {
          voiceGreetingSent = true;
          greetedRef.current = true;
          setConversation([
            {
              role: "alexis",
              text: "I’m ready to help diagnose your vehicle issue. Describe the symptom you’re experiencing:\n\n• What is the vehicle doing (or not doing)?\n• When does it happen? (cold start, warm, under load, at speed)\n• How often? (always, intermittent, specific conditions)\n• Any warning lights, sounds, or smells?\n\nThe more detail you provide, the faster we can narrow the fault tree."
            }
          ]);
        }
        return;
      }

      // Deduplicate concurrent inits (StrictMode / remount)
      if (!voiceSessionInitPromise) {
        voiceSessionInitPromise = (async () => {
          setStatus("Connecting...");
          setInitState("INIT");

          const loginRes = await fetch(`${API_URL}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Technician", email: "tech@alexis.local" })
          });
          const loginData = await loginRes.json();

          const sessionRes = await fetch(`${API_URL}/api/session/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ technician_id: loginData.technician_id })
          });
          const sessionData = await sessionRes.json();

          return sessionData;
        })();
      }

      const sessionData = await voiceSessionInitPromise;

      if (sessionData?.live) {
        voiceCachedSessionId = sessionData.session_id;
        setSessionId(sessionData.session_id);
        setStatus("LIVE - Symptom Diagnostics");
        setInitState("LIVE");

        // Initial ALEXIS greeting (single-shot across StrictMode remounts)
        if (!voiceGreetingSent && !greetedRef.current) {
          voiceGreetingSent = true;
          greetedRef.current = true;
          setConversation([
            {
              role: "alexis",
              text: "I’m ready to help diagnose your vehicle issue. Describe the symptom you’re experiencing:\n\n• What is the vehicle doing (or not doing)?\n• When does it happen? (cold start, warm, under load, at speed)\n• How often? (always, intermittent, specific conditions)\n• Any warning lights, sounds, or smells?\n\nThe more detail you provide, the faster we can narrow the fault tree."
            }
          ]);
        }
      } else {
        setStatus("Offline");
        setInitState("ERROR");
      }
    } catch (err) {
      console.error("Session init error:", err);
      setStatus("Connection Failed");
      setInitState("ERROR");
      setSttError(err?.message || "Connection failed. Please refresh and try again.");
      // Allow retry on next mount
      voiceSessionInitPromise = null;
      voiceCachedSessionId = null;
      voiceGreetingSent = false;
    }
  };

  // Voice handlers
  const startRecording = async () => {
    if (isProcessing || isSpeaking) return;
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
      setInitState("LISTENING");
      setStatus("Listening... describe the symptom");
    } catch (err) {
      const name = err?.name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        setSttError("Microphone permission blocked. Allow mic access in Chrome site settings.");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setSttError("No microphone device found. Connect a mic/headset and retry.");
      } else {
        setSttError("Could not access microphone.");
      }
      setMicReady(false);
      setStatus("LIVE - Symptom Diagnostics");
      setInitState("LIVE");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setInitState("ANALYZING");
      setStatus("Processing speech...");
    }
  };

  const toggleMic = () => isRecording ? stopRecording() : startRecording();

  const processAudio = async (audioBlob) => {
    setIsProcessing(true);
    setSttError(null);
    setInitState("ANALYZING");
    setStatus("Converting speech to text...");
    
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");
      
      const sttRes = await fetch(`${API_URL}/api/stt`, { method: "POST", body: formData });
      
      if (!sttRes.ok) {
        throw new Error(`STT failed with status ${sttRes.status}`);
      }
      
      const sttData = await sttRes.json();
      
      if (!sttData.transcript || sttData.transcript.trim() === "") {
        setSttError("No speech detected. Please try again and speak clearly.");
        setStatus("LIVE - Symptom Diagnostics");
        setIsProcessing(false);
        return;
      }
      
      setTechnicianTranscript(sttData.transcript);
      setStatus("Speech recognized. Analyzing symptoms...");
      await sendToAlexis(sttData.transcript);
      
    } catch (err) {
      setSttError(`Speech recognition failed: ${err.message}`);
      setStatus("LIVE - Symptom Diagnostics");
    } finally {
      setIsProcessing(false);
    }
  };

  // Send to ALEXIS with SYMPTOM AUDIO DIAGNOSTICS context
  const sendToAlexis = async (text) => {
    if (!text.trim() || !sessionId) return;
    setIsProcessing(true);
    setSttError(null);

    const techMessage = { role: "technician", text: text.trim() };
    setConversation(prev => [...prev, techMessage]);

    try {
      setInitState("ANALYZING");
      setStatus("ALEXIS is analyzing symptoms...");
      
      const chatRes = await fetch(`${API_URL}/api/diagnostic/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          session_id: sessionId, 
          transcript: text.trim(),
          context: PAGE_CONTEXT  // "symptom_audio_diagnostics"
        })
      });

      if (!chatRes.ok) {
        const detail = await chatRes.text().catch(() => "");
        throw new Error(`Chat failed (${chatRes.status}) ${detail}`);
      }
      const chatData = await chatRes.json();

      const alexisMessage = { role: "alexis", text: chatData.response };
      setConversation(prev => [...prev, alexisMessage]);
      setTechnicianTranscript("");
      setInitState("SPEAKING");
      setStatus("ALEXIS is speaking...");

      // Speak asynchronously so UI updates (chat bubble render) are not blocked
      speakResponse(chatData.response);
    } catch (err) {
      setConversation((prev) => [
        ...prev,
        {
          role: "alexis",
          text: "Request failed. Please retry."
        }
      ]);
      setSttError(err?.message || "Request failed");
      setStatus("LIVE - Symptom Diagnostics");
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
            setStatus("LIVE - Symptom Diagnostics");
            URL.revokeObjectURL(audioUrl); 
          };
          audio.onerror = () => browserSpeak(cleanText);
          await audio.play();
          return;
        }
      }
      browserSpeak(cleanText);
    } catch {
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
      'Samantha', 'Karen', 'Victoria', 'Fiona',
      'Google US English Female', 'Google UK English Female'
    ];
    
    let selectedVoice = null;
    for (const targetName of femaleVoicePriority) {
      selectedVoice = voices.find(v => v.name.toLowerCase().includes(targetName.toLowerCase()));
      if (selectedVoice) break;
    }
    if (selectedVoice) utterance.voice = selectedVoice;
    
    utterance.onend = () => { setIsSpeaking(false); setStatus("LIVE - Symptom Diagnostics"); };
    utterance.onerror = () => { setIsSpeaking(false); setStatus("LIVE - Symptom Diagnostics"); };
    window.speechSynthesis.speak(utterance);
  };

  const handleSend = () => {
    if (technicianTranscript.trim()) sendToAlexis(technicianTranscript);
  };

  const handleClear = () => {
    setTechnicianTranscript("");
  };

  return (
    <div className="flex flex-col h-full min-h-0 text-slate-100">
      {/* Header */}
      <div className="flex-shrink-0 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-wide text-slate-100" data-testid="voice-diagnostics-title">
              Voice Diagnostics
            </h1>
            <p className="mt-1 text-sm text-slate-300/90">
              Symptom-based fault diagnosis with ALEXIS
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`px-3 py-1 rounded text-xs font-bold uppercase tracking-wider ${
                sessionId
                  ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                  : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40'
              }`}
              data-testid="voice-diagnostics-status"
            >
              {status}
            </span>
            {isSpeaking && <Volume2 className="h-4 w-4 text-cyan-400 animate-pulse" />}
            {isRecording && <span className="text-red-400 text-xs animate-pulse">● REC</span>}
          </div>
        </div>
      </div>

      {/* STT Error Banner */}
      {sttError && (
        <div className="flex-shrink-0 mb-4 px-4 py-2 bg-red-900/30 border border-red-800/50 rounded-lg flex items-center gap-2" data-testid="voice-diagnostics-error-banner">
          <AlertCircle className="h-4 w-4 text-red-400" />
          <span className="text-sm text-red-300">{sttError}</span>
          <button data-testid="voice-diagnostics-error-dismiss" onClick={() => setSttError(null)} className="ml-auto text-red-400 hover:text-red-300 text-xs">Dismiss</button>
        </div>
      )}

      {/* Main workspace */}
      <section className="flex-1 rounded-2xl border border-slate-700 bg-slate-950/90 flex flex-col overflow-hidden">
        {/* Context indicator */}
        <div className="flex-shrink-0 px-6 py-3 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">ALEXIS - Symptom Diagnostics</h2>
            <p className="text-xs text-orange-400/80 mt-0.5">Context: Symptom-Based Fault Analysis</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {micReady ? (
              <span className="text-green-400">● Mic Ready</span>
            ) : (
              <span className="text-yellow-400">○ Mic Not Armed</span>
            )}
          </div>
        </div>

        {/* Conversation area */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4" data-testid="voice-diagnostics-conversation">
          {conversation.map((entry, idx) => (
            <div key={idx} className={`rounded-lg p-4 ${
              entry.role === "technician" 
                ? 'bg-blue-900/30 border border-blue-800/50 ml-8' 
                : 'bg-slate-800/50 border border-slate-700/50 mr-8'
            }`}>
              <p className={`text-[10px] uppercase tracking-wider font-semibold mb-2 ${
                entry.role === "technician" ? 'text-blue-400' : 'text-orange-400'
              }`}>
                {entry.role === "technician" ? "You (Symptom Description)" : "ALEXIS (Diagnostic Analysis)"}
              </p>
              <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">{entry.text}</p>
            </div>
          ))}
          <div ref={conversationEndRef} />
        </div>

        {/* Input area */}
        <div className="flex-shrink-0 p-4 border-t border-slate-800 bg-slate-900/80">
          <div className="flex items-center gap-4">
            {/* Large Mic Button */}
            <Button
              variant="outline"
              onClick={toggleMic}
              disabled={isProcessing || !sessionId}
              data-testid="voice-diagnostics-mic-button"
              className={`h-16 w-16 rounded-full p-0 flex-shrink-0 transition-all ${
                isRecording 
                  ? 'bg-red-600 border-red-500 text-white animate-pulse scale-110' 
                  : micReady
                    ? 'bg-slate-800 border-green-500/50 text-green-400 hover:bg-slate-700'
                    : 'bg-slate-800 border-slate-600 text-slate-400'
              } ${isProcessing ? 'opacity-50' : ''}`}
            >
              {isRecording ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </Button>

            <div className="flex-1 flex flex-col gap-2">
              <Textarea
                value={technicianTranscript}
                data-testid="voice-diagnostics-transcript-input"
                onChange={(e) => setTechnicianTranscript(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }}}
                placeholder={isRecording ? "Listening..." : "Describe the symptom: what happens, when, how often..."}
                className="min-h-[60px] max-h-[100px] resize-none bg-slate-950 border-slate-700 text-sm text-slate-100 placeholder:text-slate-500"
              />
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={handleClear}
                  data-testid="voice-diagnostics-clear-button"
                  className="h-8 px-3 rounded-full border-slate-700 bg-slate-950/90 text-xs text-slate-300"
                >
                  Clear
                </Button>
                <Button
                  onClick={handleSend}
                  disabled={isProcessing || !technicianTranscript.trim() || !sessionId}
                  data-testid="voice-diagnostics-send-button"
                  className="h-8 px-6 bg-orange-600 hover:bg-orange-500 text-white font-semibold uppercase tracking-wider text-xs disabled:opacity-40"
                >
                  {isProcessing ? '...' : 'Analyze'}
                </Button>
              </div>
            </div>
          </div>

          <p className="text-[10px] text-slate-500 mt-3 text-center">
            Describe symptoms clearly. ALEXIS will ask clarifying questions before forming a diagnosis.
            If symptoms are unclear, ALEXIS will recommend connecting via OBD/DLC for scan data.
          </p>
        </div>
      </section>
    </div>
  );
};

export default VoiceDiagnosticsPage;
