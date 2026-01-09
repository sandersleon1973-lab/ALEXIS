import React, { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Mic, MicOff, Volume2, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";

// Worker path (Emergent / CRA-safe)
// Served from /public to avoid module resolution issues.
pdfjs.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.min.mjs`;

const API_URL = process.env.REACT_APP_BACKEND_URL;

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

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioRef = useRef(null);
  const conversationEndRef = useRef(null);

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

  // Initialize session and arm microphone on mount
  useEffect(() => {
    initSession();
    armMicrophone();
  }, []);

  // Arm microphone - request permission immediately
  const armMicrophone = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop()); // Release immediately, just checking permission
      setMicReady(true);
      console.log("Microphone armed and ready");
    } catch (err) {
      console.error("Mic permission denied:", err);
      setMicReady(false);
      setSttError("Microphone access denied. Please allow microphone permission.");
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
        
        // Add initial ALEXIS greeting for diagram context
        setConversation([{
          role: "alexis",
          text: "I'm ready to help you understand this wiring diagram. You can:\n\n• Ask me to explain any symbol or component\n• Request help tracing a specific circuit\n• Ask about connector pinouts or wire colors\n• Get guidance on reading schematic conventions\n\nWhich part of the diagram would you like me to explain?"
        }]);
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

  // Send to ALEXIS with DIAGRAM ASSISTANCE context
  const sendToAlexis = async (text) => {
    if (!text.trim() || !sessionId) return;
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

      const alexisMessage = { role: "alexis", text: chatData.response };
      setConversation(prev => [...prev, alexisMessage]);
      setTechnicianTranscript("");
      setStatus("ALEXIS is speaking...");

      await speakResponse(chatData.response);
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
    if (technicianTranscript.trim()) sendToAlexis(technicianTranscript);
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
        <div className="flex-shrink-0 px-6 py-2 bg-red-900/30 border-b border-red-800/50 flex items-center gap-2">
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
                <Button variant="ghost" size="sm" onClick={handleZoomOut} className="h-8 w-8 p-0 text-slate-300 hover:text-white hover:bg-slate-700">
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-xs text-slate-400 w-12 text-center">{Math.round(scale * 100)}%</span>
                <Button variant="ghost" size="sm" onClick={handleZoomIn} className="h-8 w-8 p-0 text-slate-300 hover:text-white hover:bg-slate-700">
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </div>
              
              {numPages && (
                <div className="flex items-center gap-1 bg-slate-800/80 rounded-lg p-1">
                  <Button variant="ghost" size="sm" onClick={handlePrevPage} disabled={currentPage <= 1} className="h-8 w-8 p-0 text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-30">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs text-slate-400 w-16 text-center">{currentPage} / {numPages}</span>
                  <Button variant="ghost" size="sm" onClick={handleNextPage} disabled={currentPage >= numPages} className="h-8 w-8 p-0 text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-30">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* PDF Display Area */}
          <div className="flex-1 overflow-auto bg-slate-950 p-4">
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
                  <Page
                    pageNumber={currentPage}
                    scale={scale}
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                  />
                </Document>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-500">
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
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4" data-testid="conversation-log">
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
                data-testid="transcript-input"
              />
              <Button
                onClick={handleSend}
                disabled={isProcessing || !technicianTranscript.trim() || !sessionId}
                className="h-12 px-6 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold uppercase tracking-wider text-xs disabled:opacity-40"
                data-testid="send-button"
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
