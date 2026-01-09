import React, { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Mic, MicOff, Volume2, AlertCircle, Send } from "lucide-react";

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Context-specific initial messages
const INITIAL_MESSAGES = {
  VOICE_SYMPTOM_DIAGNOSTICS: {
    role: "alexis",
    content: "ALEXIS DIAGNOSTIC AUTHORITY - ONLINE\n\nState the symptom. Include:\n• Vehicle year, make, model, engine\n• Exact symptom description\n• When it occurs\n\nAwaiting input.",
    timestamp: new Date().toISOString()
  },
  VISUAL_DIAGNOSTICS: {
    role: "alexis", 
    content: "ALEXIS VISUAL INSPECTION - ONLINE\n\nShow the component. State what requires verification.\n\nAwaiting visual input.",
    timestamp: new Date().toISOString()
  },
  WIRING_DIAGRAM_INTERPRETATION: {
    role: "alexis",
    content: "ALEXIS DIAGRAM ASSISTANCE - ONLINE\n\nDiagram loaded. State which circuit or component requires explanation.\n\nAwaiting input.",
    timestamp: new Date().toISOString()
  }
};

// Map context to backend context strings
const CONTEXT_MAP = {
  VOICE_SYMPTOM_DIAGNOSTICS: "symptom_audio_diagnostics",
  VISUAL_DIAGNOSTICS: "visual_inspection", 
  WIRING_DIAGRAM_INTERPRETATION: "diagram_assistance"
};

// Status labels per context
const STATUS_LABELS = {
  VOICE_SYMPTOM_DIAGNOSTICS: "LIVE - Symptom Diagnostics",
  VISUAL_DIAGNOSTICS: "LIVE - Visual Inspection",
  WIRING_DIAGRAM_INTERPRETATION: "LIVE - Diagram Assistance"
};

// Page titles per context
const PAGE_TITLES = {
  VOICE_SYMPTOM_DIAGNOSTICS: "Voice Diagnostics",
  VISUAL_DIAGNOSTICS: "Visual Diagnostics",
  WIRING_DIAGRAM_INTERPRETATION: "Wiring Diagram Viewer"
};

const ALEXISConversationPanel = ({ 
  context = "VOICE_SYMPTOM_DIAGNOSTICS",
  toolsPanel = null,
  onAttachment = null
}) => {
  const [conversation, setConversation] = useState([]);
  const [inputText, setInputText] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [status, setStatus] = useState("Initializing...");
  const [error, setError] = useState(null);
  const [micReady, setMicReady] = useState(false);

  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation]);

  // Pre-load browser voices
  useEffect(() => {
    const loadVoices = () => window.speechSynthesis.getVoices();
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  // Initialize session
  useEffect(() => {
    initSession();
    armMicrophone();
  }, [context]);

  const armMicrophone = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      setMicReady(true);
    } catch (err) {
      setMicReady(false);
    }
  };

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
        body: JSON.stringify({ technician_id: loginData.technician_id })
      });
      const sessionData = await sessionRes.json();

      if (sessionData.live) {
        setSessionId(sessionData.session_id);
        setStatus(STATUS_LABELS[context] || "LIVE");
        setConversation([INITIAL_MESSAGES[context] || INITIAL_MESSAGES.VOICE_SYMPTOM_DIAGNOSTICS]);
      } else {
        setStatus("Offline");
      }
    } catch (err) {
      console.error("Session init error:", err);
      setStatus("Connection Failed");
    }
  };

  // Browser-based speech recognition
  const startBrowserRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Browser speech recognition not supported. Please type your message.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsRecording(true);
      setStatus("Listening...");
    };

    recognition.onresult = async (event) => {
      const transcript = event.results[0][0].transcript;
      setIsRecording(false);
      if (transcript && transcript.trim()) {
        setInputText(transcript);
        await sendMessage(transcript);
      } else {
        setError("No speech detected. Please try again.");
        setStatus(STATUS_LABELS[context] || "LIVE");
      }
    };

    recognition.onerror = (event) => {
      setIsRecording(false);
      if (event.error === 'no-speech') {
        setError("No speech detected. Please try again.");
      } else if (event.error === 'not-allowed') {
        setError("Microphone access denied.");
        setMicReady(false);
      } else {
        setError(`Speech error: ${event.error}`);
      }
      setStatus(STATUS_LABELS[context] || "LIVE");
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopBrowserRecognition = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
    }
  };

  const toggleMic = () => {
    if (isRecording) {
      stopBrowserRecognition();
    } else {
      if (!sessionId) {
        setError("Session not ready.");
        return;
      }
      setError(null);
      startBrowserRecognition();
    }
  };

  // Send message to ALEXIS
  const sendMessage = async (text) => {
    const messageText = text || inputText;
    if (!messageText.trim() || !sessionId) return;
    
    setIsProcessing(true);
    setError(null);
    setInputText("");

    const techMessage = {
      role: "technician",
      content: messageText.trim(),
      timestamp: new Date().toISOString()
    };
    setConversation(prev => [...prev, techMessage]);

    try {
      setStatus("ALEXIS is thinking...");
      
      const chatRes = await fetch(`${API_URL}/api/diagnostic/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          session_id: sessionId, 
          transcript: messageText.trim(),
          context: CONTEXT_MAP[context] || "symptom_audio_diagnostics"
        })
      });

      if (!chatRes.ok) throw new Error("Chat request failed");
      const chatData = await chatRes.json();

      const alexisMessage = {
        role: "alexis",
        content: chatData.response,
        timestamp: new Date().toISOString()
      };
      setConversation(prev => [...prev, alexisMessage]);
      setStatus("ALEXIS is speaking...");

      await speakResponse(chatData.response);
      
    } catch (err) {
      console.error("Chat error:", err);
      const errorMessage = {
        role: "alexis",
        content: "I apologize, but I encountered an error. Please try again.",
        timestamp: new Date().toISOString()
      };
      setConversation(prev => [...prev, errorMessage]);
      setStatus(STATUS_LABELS[context] || "LIVE");
    } finally {
      setIsProcessing(false);
    }
  };

  // Add system message
  const addSystemMessage = useCallback((content, attachments = []) => {
    const systemMessage = {
      role: "system",
      content,
      attachments,
      timestamp: new Date().toISOString()
    };
    setConversation(prev => [...prev, systemMessage]);
  }, []);

  useEffect(() => {
    if (onAttachment) {
      onAttachment(addSystemMessage);
    }
  }, [onAttachment, addSystemMessage]);

  // TTS
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
            setStatus(STATUS_LABELS[context] || "LIVE");
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
    utterance.pitch = 1.0;
    utterance.lang = 'en-US';
    
    const voices = window.speechSynthesis.getVoices();
    let selectedVoice = voices.find(v => v.name.includes('Microsoft Ava Online'));
    if (!selectedVoice) selectedVoice = voices.find(v => v.name.includes('Microsoft Ava'));
    if (!selectedVoice) selectedVoice = voices.find(v => v.name.toLowerCase().includes('ava'));
    if (!selectedVoice) selectedVoice = voices.find(v => v.name.includes('Microsoft') && v.lang.startsWith('en'));
    if (selectedVoice) utterance.voice = selectedVoice;
    
    utterance.onend = () => { setIsSpeaking(false); setStatus(STATUS_LABELS[context] || "LIVE"); };
    utterance.onerror = () => { setIsSpeaking(false); setStatus(STATUS_LABELS[context] || "LIVE"); };
    window.speechSynthesis.speak(utterance);
  };

  const handleSend = () => sendMessage();

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* ═══════════════════════════════════════════════════════════════
          REGION A: FIXED HEADER (Non-scrolling)
          ═══════════════════════════════════════════════════════════════ */}
      <header className="flex-shrink-0 px-6 py-4 border-b border-slate-800 bg-slate-900/95 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-100">
              {PAGE_TITLES[context] || "ALEXIS"}
            </h1>
            <div className="flex items-center gap-3 mt-1">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                sessionId 
                  ? 'bg-green-500/20 text-green-400 border border-green-500/40' 
                  : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40'
              }`}>
                {status}
              </span>
              {isSpeaking && <Volume2 className="h-3.5 w-3.5 text-cyan-400 animate-pulse" />}
              {isRecording && <span className="text-red-400 text-[10px] animate-pulse font-semibold">● REC</span>}
            </div>
          </div>
          <div className="text-[10px] text-slate-400">
            {micReady ? (
              <span className="text-green-400">● Mic Ready</span>
            ) : (
              <span className="text-yellow-400">○ Mic Not Armed</span>
            )}
          </div>
        </div>
        
        {/* Error Banner */}
        {error && (
          <div className="mt-3 px-3 py-2 bg-red-900/30 border border-red-800/50 rounded flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
            <span className="text-xs text-red-300 flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300 text-[10px]">✕</button>
          </div>
        )}
      </header>

      {/* ═══════════════════════════════════════════════════════════════
          OPTIONAL TOOLS PANEL (Camera, PDF - sits below header)
          ═══════════════════════════════════════════════════════════════ */}
      {toolsPanel && (
        <div className="flex-shrink-0 border-b border-slate-800">
          {toolsPanel}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          REGION B: SCROLLABLE MESSAGE HISTORY (Only scrollable area)
          ═══════════════════════════════════════════════════════════════ */}
      <div 
        className="flex-1 overflow-y-auto px-6 py-4 space-y-4" 
        data-testid="conversation-log"
      >
        {conversation.map((msg, idx) => (
          <div 
            key={idx} 
            className={`rounded-lg p-4 ${
              msg.role === "technician" 
                ? 'bg-blue-900/30 border border-blue-800/50 ml-12' 
                : msg.role === "system"
                  ? 'bg-slate-700/30 border border-slate-600/50 mx-6 text-center'
                  : 'bg-slate-800/50 border border-slate-700/50 mr-12'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <p className={`text-[10px] uppercase tracking-wider font-semibold ${
                msg.role === "technician" ? 'text-blue-400' : 
                msg.role === "system" ? 'text-slate-400' : 'text-cyan-400'
              }`}>
                {msg.role === "technician" ? "You" : msg.role === "system" ? "System" : "ALEXIS"}
              </p>
              {msg.timestamp && (
                <span className="text-[9px] text-slate-500">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">{msg.content}</p>
            {msg.attachments && msg.attachments.length > 0 && (
              <div className="mt-2 flex gap-2 flex-wrap">
                {msg.attachments.map((att, i) => (
                  <span key={i} className="text-[10px] bg-slate-700 px-2 py-1 rounded">{att.name || 'Attachment'}</span>
                ))}
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          REGION C: FIXED INPUT BAR (Non-scrolling, pinned to bottom)
          ═══════════════════════════════════════════════════════════════ */}
      <footer className="flex-shrink-0 p-4 border-t border-slate-800 bg-slate-900/95 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          {/* Mic Button */}
          <Button
            variant="outline"
            onClick={toggleMic}
            disabled={isProcessing || !sessionId}
            data-testid="mic-button"
            className={`h-11 w-11 rounded-full p-0 flex-shrink-0 transition-all ${
              isRecording 
                ? 'bg-red-600 border-red-500 text-white animate-pulse scale-110' 
                : micReady
                  ? 'bg-slate-800 border-green-500/50 text-green-400 hover:bg-slate-700'
                  : 'bg-slate-800 border-slate-600 text-slate-400'
            } ${isProcessing ? 'opacity-50' : ''}`}
          >
            {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>

          {/* Text Input */}
          <Textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isRecording ? "Listening..." : "Type your message or click mic to speak..."}
            className="flex-1 min-h-[44px] max-h-[88px] resize-none bg-slate-950 border-slate-700 text-sm text-slate-100 placeholder:text-slate-500"
            data-testid="message-input"
            disabled={isProcessing}
          />

          {/* Send Button */}
          <Button
            onClick={handleSend}
            disabled={isProcessing || !inputText.trim() || !sessionId}
            className="h-11 w-11 p-0 bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-40 rounded-full"
            data-testid="send-button"
          >
            {isProcessing ? (
              <span className="text-xs">...</span>
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </footer>
    </div>
  );
};

export default ALEXISConversationPanel;
