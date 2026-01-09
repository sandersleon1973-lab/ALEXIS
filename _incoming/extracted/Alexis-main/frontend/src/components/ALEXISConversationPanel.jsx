import React, { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Mic, MicOff, Volume2, AlertCircle, Send, Plus } from "lucide-react";
import { usePluginCapability } from "@/context/PluginRegistryContext";
import { useDiagramTeaching } from "@/context/DiagramTeachingContext";

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Context-specific initial messages - these appear IN THE CHAT STREAM
const INITIAL_MESSAGES = {
  VOICE_SYMPTOM_DIAGNOSTICS: {
    role: "alexis",
    content: "ALEXIS DIAGNOSTIC AUTHORITY — ONLINE\n\nState the symptom. Include:\n• Vehicle year, make, model, engine\n• Exact symptom description\n• When it occurs",
    timestamp: new Date().toISOString()
  },
  VISUAL_DIAGNOSTICS: {
    role: "alexis", 
    content: "ALEXIS VISUAL INSPECTION — ONLINE\n\nShow the component. State what requires verification.",
    timestamp: new Date().toISOString()
  },
  WIRING_DIAGRAM_INTERPRETATION: {
    role: "alexis",
    content: "ALEXIS DIAGRAM ASSISTANCE — ONLINE\n\nUpload a wiring diagram using the + button below, then ask about any circuit or component.",
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
  VOICE_SYMPTOM_DIAGNOSTICS: "LIVE",
  VISUAL_DIAGNOSTICS: "LIVE",
  WIRING_DIAGRAM_INTERPRETATION: "LIVE"
};

const ALEXISConversationPanel = ({ 
  context = "VOICE_SYMPTOM_DIAGNOSTICS",
  onAttachment = null,
  onOverlayCommands = null,
  onUploadClick = null,
  // For wiring diagrams: inline PDF preview in chat
  inlineContent = null,
}) => {
  const [conversation, setConversation] = useState([]);
  const [inputText, setInputText] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState("Initializing...");
  const [error, setError] = useState(null);
  const [micReady, setMicReady] = useState(false);

  // ═══════════════════════════════════════════════════════════════════════
  // VOICE STATE MACHINE - CRITICAL FOR TURN-TAKING
  // States: IDLE | USER_SPEAKING | ALEXIS_SPEAKING
  // ═══════════════════════════════════════════════════════════════════════
  const [voiceState, setVoiceState] = useState("IDLE"); // IDLE | USER_SPEAKING | ALEXIS_SPEAKING
  const audioRef = useRef(null); // Reference to current ALEXIS audio
  const utteranceRef = useRef(null); // Reference to browser speech utterance

  // Get diagram context for ALEXIS awareness
  const { diagramMetadata } = useDiagramTeaching();

  // Plugin-based capability checks
  const { canUseLive, canUseAuthority, blockReason } = usePluginCapability([
    context === "VOICE_SYMPTOM_DIAGNOSTICS" ? "voice_diagnostics_engine" : null,
    context === "WIRING_DIAGRAM_INTERPRETATION" ? "visual_wiring_interpretation" : null,
  ].filter(Boolean));
  const [responseMode, setResponseMode] = useState(
    context === "WIRING_DIAGRAM_INTERPRETATION" ? "EXPLANATION" : "EXPLANATION"
  ); // reserved for future modes
  const [authorityScope, setAuthorityScope] = useState(null); // null | "ONE_RESPONSE"

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // ═══════════════════════════════════════════════════════════════════════
  // VOICE STATE MACHINE - CRITICAL FOR DIAGNOSTICS
  // States: IDLE | USER_SPEAKING | PROCESSING | ALEXIS_SPEAKING
  // ═══════════════════════════════════════════════════════════════════════
  
  // Accumulated transcript during speech
  const accumulatedTranscriptRef = useRef("");
  const silenceTimeoutRef = useRef(null);
  
  // Browser-based speech recognition with AUTO-SEND
  const startBrowserRecognition = () => {
    // CRITICAL: Stop ALEXIS if she's speaking - USER ALWAYS HAS PRIORITY
    stopAlexisSpeaking();
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Browser speech recognition not supported. Please type your message.");
      return;
    }

    // Reset accumulated transcript
    accumulatedTranscriptRef.current = "";

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setVoiceState("USER_SPEAKING");
      setStatus("🎤 Listening...");
      setError(null);
    };

    recognition.onresult = (event) => {
      // Clear any pending silence timeout
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }

      let finalTranscript = "";
      let interimTranscript = "";
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }
      
      // Accumulate final transcript
      if (finalTranscript) {
        accumulatedTranscriptRef.current += " " + finalTranscript;
        setInputText(accumulatedTranscriptRef.current.trim());
      }
      
      // Show what we're hearing
      if (interimTranscript) {
        setStatus(`🎤 "${interimTranscript.slice(0, 60)}..."`);
      } else if (accumulatedTranscriptRef.current) {
        setStatus(`🎤 Heard: "${accumulatedTranscriptRef.current.trim().slice(0, 40)}..."`);
      }

      // Set silence timeout - after 1.5s of silence, auto-send
      silenceTimeoutRef.current = setTimeout(() => {
        const transcript = accumulatedTranscriptRef.current.trim();
        if (transcript && voiceState === "USER_SPEAKING") {
          // Stop recognition and send
          if (recognitionRef.current) {
            recognitionRef.current.stop();
          }
          autoSendVoiceMessage(transcript);
        }
      }, 1500);
    };

    recognition.onerror = (event) => {
      if (event.error === 'no-speech') {
        setStatus("No speech detected. Tap mic to try again.");
        setVoiceState("IDLE");
      } else if (event.error === 'not-allowed') {
        setError("Microphone access denied. Please allow microphone access.");
        setMicReady(false);
        setVoiceState("IDLE");
      } else if (event.error !== 'aborted') {
        setError(`Speech error: ${event.error}`);
        setVoiceState("IDLE");
      }
    };

    recognition.onend = () => {
      // Clear silence timeout
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }

      // If we have accumulated transcript and still in USER_SPEAKING, auto-send
      const transcript = accumulatedTranscriptRef.current.trim();
      if (transcript && voiceState === "USER_SPEAKING") {
        autoSendVoiceMessage(transcript);
      } else if (voiceState === "USER_SPEAKING") {
        setVoiceState("IDLE");
        setStatus(STATUS_LABELS[context] || "LIVE");
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  // Auto-send voice message after recognition ends
  const autoSendVoiceMessage = async (transcript) => {
    if (!transcript || !sessionId) {
      setVoiceState("IDLE");
      setStatus(STATUS_LABELS[context] || "LIVE");
      return;
    }

    setVoiceState("PROCESSING");
    setStatus("Processing...");
    setInputText(transcript);
    
    // Small delay to show the transcript before sending
    await new Promise(r => setTimeout(r, 300));
    
    // Send the message
    await sendMessage(transcript);
  };

  const stopBrowserRecognition = () => {
    // Clear silence timeout
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }

    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
  };

  // CRITICAL: Stop ALEXIS from speaking - user interrupt
  const stopAlexisSpeaking = () => {
    // Stop HTML5 Audio if playing
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    // Stop browser speech synthesis
    window.speechSynthesis.cancel();
    if (utteranceRef.current) {
      utteranceRef.current = null;
    }
    if (voiceState === "ALEXIS_SPEAKING") {
      setVoiceState("IDLE");
      setStatus(STATUS_LABELS[context] || "LIVE");
    }
  };

  const toggleMic = () => {
    // If ALEXIS is speaking, stop her and start listening
    if (voiceState === "ALEXIS_SPEAKING") {
      stopAlexisSpeaking();
      startBrowserRecognition();
      return;
    }
    
    // If processing, don't allow mic
    if (voiceState === "PROCESSING" || isProcessing) {
      return;
    }
    
    // If user is speaking, stop recording (will auto-send)
    if (voiceState === "USER_SPEAKING") {
      stopBrowserRecognition();
      return;
    }
    
    // Start recording from IDLE state
    if (!sessionId) {
      setError("Session not ready. Please wait...");
      return;
    }
    if (!canUseLive) {
      setError(blockReason || "Live diagnostics capability is disabled.");
      return;
    }
    setError(null);
    startBrowserRecognition();
  };

  // Send message to ALEXIS
  const sendMessage = async (text) => {
    const modeForThisMessage = responseMode;
    const messageText = text || inputText;
    if (!messageText.trim() || !sessionId) {
      setVoiceState("IDLE");
      setStatus(STATUS_LABELS[context] || "LIVE");
      return;
    }
    
    // Set PROCESSING state
    setVoiceState("PROCESSING");
    setIsProcessing(true);
    setError(null);
    setInputText("");
    setStatus("ALEXIS is thinking...");

    const techMessage = {
      role: "technician",
      content: messageText.trim(),
      timestamp: new Date().toISOString()
    };
    setConversation(prev => [...prev, techMessage]);

    try {
      if (!canUseLive) {
        setError(blockReason || "Live diagnostics capability is disabled.");
        setVoiceState("IDLE");
        setStatus(STATUS_LABELS[context] || "LIVE");
        return;
      }
      
      const tapContext =
        context === "WIRING_DIAGRAM_INTERPRETATION"
          ? window.__ALEXIS_DIAGRAM_TAP_CONTEXT__ || null
          : null;

      // Build diagram context for ALEXIS awareness
      const diagramContext = 
        context === "WIRING_DIAGRAM_INTERPRETATION" && diagramMetadata?.loaded
          ? {
              loaded: true,
              filename: diagramMetadata.filename,
              totalPages: diagramMetadata.totalPages,
              currentPage: diagramMetadata.currentPage,
              loadedAt: diagramMetadata.loadedAt,
            }
          : null;

      const chatRes = await fetch(`${API_URL}/api/diagnostic/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          response_mode: canUseAuthority ? modeForThisMessage : "EXPLANATION",
          session_id: sessionId, 
          transcript: messageText.trim(),
          context: CONTEXT_MAP[context] || "symptom_audio_diagnostics",
          tap_context: tapContext,
          diagram_context: diagramContext,
        })
      });

      if (!chatRes.ok) throw new Error("Chat request failed");
      const chatData = await chatRes.json();

      const alexisMessage = {
        role: "alexis",
        content: chatData.response,
        timestamp: new Date().toISOString(),
        overlayCommands: chatData.overlayCommands || null,
      };

      setConversation(prev => [...prev, alexisMessage]);

      // If diagram assistance, push overlayCommands
      if (context === "WIRING_DIAGRAM_INTERPRETATION" && chatData.overlayCommands && onOverlayCommands) {
        onOverlayCommands(chatData.overlayCommands);
      }

      // If Authority was scoped to one response, revert back
      if (authorityScope === "ONE_RESPONSE") {
        setResponseMode("EXPLANATION");
        setAuthorityScope(null);
      }
      
      // Speak the response
      await speakResponse(chatData.response);
      
    } catch (err) {
      console.error("Chat error:", err);
      const errorMessage = {
        role: "alexis",
        content: "I apologize, but I encountered an error. Please try again.",
        timestamp: new Date().toISOString()
      };
      setConversation(prev => [...prev, errorMessage]);
      setVoiceState("IDLE");
      setStatus(STATUS_LABELS[context] || "LIVE");
    } finally {
      setIsProcessing(false);
      // Reset voice state to IDLE if not speaking
      if (voiceState === "PROCESSING") {
        setVoiceState("IDLE");
        setStatus(STATUS_LABELS[context] || "LIVE");
      }
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

  // TTS with proper state machine
  const speakResponse = async (text) => {
    // Don't speak if user is speaking (they have priority)
    if (voiceState === "USER_SPEAKING") {
      setVoiceState("IDLE");
      setStatus(STATUS_LABELS[context] || "LIVE");
      return;
    }
    
    setVoiceState("ALEXIS_SPEAKING");
    setStatus("🔊 ALEXIS speaking...");
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
          audioRef.current = audio; // Store reference for interrupt
          
          audio.onended = () => { 
            setVoiceState("IDLE");
            setStatus(STATUS_LABELS[context] || "LIVE");
            URL.revokeObjectURL(audioUrl);
            audioRef.current = null;
          };
          audio.onerror = () => browserSpeak(cleanText);
          
          // Check again before playing (user might have started speaking)
          if (voiceState !== "USER_SPEAKING") {
            await audio.play();
          }
          return;
        }
      }
      browserSpeak(cleanText);
    } catch {
      browserSpeak(cleanText);
    }
  };

  const browserSpeak = (text) => {
    // Don't speak if user is speaking
    if (voiceState === "USER_SPEAKING") {
      setVoiceState("IDLE");
      setStatus(STATUS_LABELS[context] || "LIVE");
      return;
    }
    
    // Ensure voices are loaded
    const speakWithVoice = () => {
      const utterance = new SpeechSynthesisUtterance(text);
      utteranceRef.current = utterance;
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.lang = 'en-US';
      
      const voices = window.speechSynthesis.getVoices();
      // Try to find a good voice
      let selectedVoice = voices.find(v => v.name.includes('Microsoft Ava Online'));
      if (!selectedVoice) selectedVoice = voices.find(v => v.name.includes('Microsoft Ava'));
      if (!selectedVoice) selectedVoice = voices.find(v => v.name.toLowerCase().includes('ava'));
      if (!selectedVoice) selectedVoice = voices.find(v => v.name.includes('Microsoft') && v.lang.startsWith('en'));
      if (!selectedVoice) selectedVoice = voices.find(v => v.name.includes('Google') && v.lang.startsWith('en'));
      if (!selectedVoice) selectedVoice = voices.find(v => v.lang.startsWith('en'));
      if (selectedVoice) utterance.voice = selectedVoice;
      
      utterance.onend = () => { 
        setVoiceState("IDLE");
        setStatus(STATUS_LABELS[context] || "LIVE");
        utteranceRef.current = null;
      };
      utterance.onerror = (e) => { 
        console.error("Browser TTS error:", e);
        setVoiceState("IDLE");
        setStatus(STATUS_LABELS[context] || "LIVE");
        utteranceRef.current = null;
      };
      
      // Cancel any ongoing speech first
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    };

    // Check if voices are loaded
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      speakWithVoice();
    } else {
      // Wait for voices to load
      window.speechSynthesis.onvoiceschanged = () => {
        speakWithVoice();
      };
      // Fallback: try speaking anyway after a short delay
      setTimeout(() => {
        if (voiceState === "ALEXIS_SPEAKING") {
          speakWithVoice();
        }
      }, 500);
    }
  };

  const handleSend = () => sendMessage();

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      // Ctrl+Enter → Authority for one response
      e.preventDefault();
      setResponseMode("AUTHORITY");
      setAuthorityScope("ONE_RESPONSE");
      sendMessage();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Get visual state indicator
  const getStateIndicator = () => {
    switch (voiceState) {
      case "USER_SPEAKING":
        return { text: "🎤 Listening...", color: "bg-red-500/15 text-red-400 border-red-500/30" };
      case "PROCESSING":
        return { text: "⏳ Processing...", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
      case "ALEXIS_SPEAKING":
        return { text: "🔊 Speaking", color: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" };
      default:
        return sessionId 
          ? { text: status, color: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" }
          : { text: "Connecting...", color: "bg-amber-500/15 text-amber-400 border border-amber-500/30" };
    }
  };

  const stateIndicator = getStateIndicator();

  /* ════════════════════════════════════════════════════════════════════════
     CHATGPT-STYLE UNIFIED LAYOUT
     ═════════════════════════════════════════════════════════════════════════
     Structure:
     1. ONE scrollable conversation area (flex-1, grows upward)
     2. Fixed input bar at bottom (never scrolls)
     3. ALL messages render in the same stream - no separate panels
     ═════════════════════════════════════════════════════════════════════════ */

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* ═══════════════════════════════════════════════════════════════════
          SCROLLABLE CONVERSATION STREAM - THE ONLY SCROLLABLE AREA
          ═══════════════════════════════════════════════════════════════════ */}
      <div 
        className="flex-1 overflow-y-auto"
        data-testid="conversation-stream"
      >
        {/* Inner container with max-width for readability */}
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
          {/* Status indicator at top of conversation */}
          <div className="flex items-center justify-center gap-3 py-2 flex-wrap">
            {/* Main state indicator */}
            <span className={`px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider border ${stateIndicator.color}`}>
              {stateIndicator.text}
            </span>
            
            {/* Interrupt button when ALEXIS is speaking */}
            {voiceState === "ALEXIS_SPEAKING" && (
              <button 
                onClick={stopAlexisSpeaking}
                className="flex items-center gap-1.5 text-cyan-400 text-[11px] hover:text-cyan-300 cursor-pointer bg-slate-800 px-3 py-1 rounded-full border border-slate-600 hover:border-cyan-500/50 transition-colors"
              >
                <Volume2 className="h-3.5 w-3.5 animate-pulse" /> 
                Click to interrupt
              </button>
            )}
            
            {/* Recording indicator with animation */}
            {voiceState === "USER_SPEAKING" && (
              <span className="flex items-center gap-2 text-red-400 text-[11px] bg-red-500/10 px-3 py-1 rounded-full border border-red-500/30">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span> 
                Speak now...
              </span>
            )}
          </div>

          {/* Error Banner - renders IN the conversation stream */}
          {error && (
            <div className="mx-auto max-w-xl px-4 py-3 bg-red-900/20 border border-red-800/40 rounded-lg flex items-center gap-3">
              <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
              <span className="text-sm text-red-300 flex-1">{error}</span>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300 text-sm font-medium">Dismiss</button>
            </div>
          )}

          {/* Inline content (e.g., PDF preview for wiring diagrams) - renders IN the conversation stream */}
          {inlineContent && (
            <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 overflow-hidden">
              {inlineContent}
            </div>
          )}

          {/* Messages */}
          {conversation.map((msg, idx) => (
            <div 
              key={idx} 
              className={`flex ${msg.role === "technician" ? 'justify-end' : 'justify-start'}`}
            >
              <div 
                className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  msg.role === "technician" 
                    ? 'bg-cyan-600/90 text-white' 
                    : msg.role === "system"
                      ? 'bg-slate-800/60 border border-slate-700/50 text-slate-300'
                      : 'bg-slate-800/80 border border-slate-700/50 text-slate-100'
                }`}
              >
                {/* Role label for ALEXIS messages */}
                {msg.role === "alexis" && (
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-cyan-400 mb-1.5">
                    ALEXIS
                  </p>
                )}
                {msg.role === "system" && (
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1.5">
                    System
                  </p>
                )}
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="mt-2 flex gap-2 flex-wrap">
                    {msg.attachments.map((att, i) => (
                      <span key={i} className="text-[10px] bg-slate-700/80 text-slate-300 px-2 py-1 rounded-full">
                        {att.name || 'Attachment'}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          
          {/* Scroll anchor */}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          FIXED INPUT BAR - PINNED TO BOTTOM, NEVER SCROLLS
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="flex-shrink-0 border-t border-slate-800 bg-slate-900/95 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-end gap-2">
            {/* Upload (+) Button */}
            {onUploadClick && (
              <Button
                type="button"
                variant="ghost"
                onClick={onUploadClick}
                disabled={isProcessing}
                data-testid="upload-plus-button"
                className="h-10 w-10 rounded-full p-0 flex-shrink-0 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              >
                <Plus className="h-5 w-5" />
              </Button>
            )}

            {/* Mic Button - ALWAYS VISIBLE, state-dependent styling */}
            <Button
              variant="ghost"
              onClick={toggleMic}
              disabled={voiceState === "PROCESSING"}
              data-testid="mic-button"
              className={`h-10 w-10 rounded-full p-0 flex-shrink-0 transition-all ${
                voiceState === "USER_SPEAKING" 
                  ? 'bg-red-600 text-white animate-pulse scale-110 shadow-lg shadow-red-500/30' 
                  : voiceState === "PROCESSING"
                    ? 'bg-amber-600 text-white opacity-50 cursor-not-allowed'
                    : voiceState === "ALEXIS_SPEAKING"
                      ? 'bg-cyan-600 text-white hover:bg-red-600 hover:scale-105'
                      : sessionId && micReady
                        ? 'bg-emerald-600 text-white hover:bg-emerald-500 hover:scale-105'
                        : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}
              title={
                voiceState === "USER_SPEAKING" ? "Listening... (click to send)" : 
                voiceState === "PROCESSING" ? "Processing..." :
                voiceState === "ALEXIS_SPEAKING" ? "Click to interrupt and speak" : 
                "Click to speak"
              }
            >
              {voiceState === "USER_SPEAKING" ? (
                <MicOff className="h-5 w-5" />
              ) : voiceState === "PROCESSING" ? (
                <span className="text-xs animate-pulse">...</span>
              ) : (
                <Mic className="h-5 w-5" />
              )}
            </Button>

            {/* Text Input */}
            <Textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                voiceState === "USER_SPEAKING" ? "🎤 Listening... speak now" : 
                voiceState === "PROCESSING" ? "Processing your message..." :
                "Message ALEXIS..."
              }
              className="flex-1 min-h-[40px] max-h-[120px] resize-none bg-slate-800/80 border-slate-700 rounded-2xl text-sm text-slate-100 placeholder:text-slate-500 px-4 py-2.5"
              data-testid="message-input"
              disabled={voiceState === "PROCESSING" || isProcessing}
            />

            {/* Send Button */}
            <Button
              onClick={handleSend}
              disabled={voiceState === "PROCESSING" || isProcessing || !inputText.trim() || !sessionId}
              className="h-10 w-10 p-0 bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-40 rounded-full flex-shrink-0"
              data-testid="send-button"
            >
              {voiceState === "PROCESSING" || isProcessing ? (
                <span className="text-xs animate-pulse">...</span>
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          
          {/* Voice hint text - changes based on state */}
          <p className="text-[10px] text-slate-500 text-center mt-2">
            {voiceState === "USER_SPEAKING" 
              ? "🎤 Speak clearly... will auto-send after silence"
              : voiceState === "ALEXIS_SPEAKING"
                ? "Click mic to interrupt ALEXIS and speak"
                : "Tap mic to speak • Press Enter to send text"
            }
          </p>
        </div>
      </div>
    </div>
  );
};

export default ALEXISConversationPanel;
