import React, { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { 
  ZoomIn, ZoomOut, ChevronLeft, ChevronRight, X, FileText, 
  Maximize2, Minimize2, MessageSquare, Send, Mic, MicOff, Plus
} from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { useDiagramTeaching } from "@/context/DiagramTeachingContext";
import { DiagramOverlayCanvas } from "@/components/DiagramOverlayCanvas";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const API_URL = process.env.REACT_APP_BACKEND_URL;

/**
 * Wiring Diagram Upload Page - FULLSCREEN SUPPORT
 * 
 * Two modes:
 * 1. Normal mode: ChatGPT-style with inline diagram preview
 * 2. Fullscreen mode: Diagram fills viewport, chat as floating panel
 */
const WiringUploadPage = () => {
  // PDF state
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfFileName, setPdfFileName] = useState("");
  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [pdfError, setPdfError] = useState(null);
  const [overlayCommands, setOverlayCommands] = useState([]);
  const [selectedRegion, setSelectedRegion] = useState(null);
  
  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [chatPanelOpen, setChatPanelOpen] = useState(true);
  
  // Chat state for fullscreen mode
  const [conversation, setConversation] = useState([
    {
      role: "alexis",
      content: "ALEXIS DIAGRAM TEACHING — ONLINE\n\nUpload a wiring diagram using the + button.\n\n📌 Visual Teaching Mode:\n• Click and drag on the diagram to select any area\n• I will highlight and explain what you select\n• Ask about circuits, relays, connectors, or wires",
      timestamp: new Date().toISOString()
    }
  ]);
  const [inputText, setInputText] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [voiceState, setVoiceState] = useState("IDLE");
  
  const pdfContainerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const silenceTimeoutRef = useRef(null);
  const accumulatedTranscriptRef = useRef("");

  const { 
    diagramTeachingEnabled, 
    enableDiagramTeaching, 
    disableDiagramTeaching,
    diagramMetadata,
    updateDiagramPage,
    updateDiagramPages 
  } = useDiagramTeaching();

  // Ref to store PDF canvas for image capture
  const pdfCanvasRef = useRef(null);
  const [capturedSelectionImage, setCapturedSelectionImage] = useState(null);
  const [isCapturingSelection, setIsCapturingSelection] = useState(false);

  // Handle user region selection on diagram - CAPTURE ACTUAL IMAGE
  const handleRegionSelect = useCallback(async (selection) => {
    setSelectedRegion(selection);
    setIsCapturingSelection(true);
    
    // Create a highlight overlay for the selected region
    const highlightCmd = {
      id: `user_selection_${Date.now()}`,
      type: "HIGHLIGHT_BOX",
      page: selection.page,
      bounds: selection.bounds,
      style: { color: "cyan", intensity: 0.7 },
      durationMs: 15000,
    };
    setOverlayCommands([highlightCmd]);
    
    // Capture the selected region from the PDF canvas
    try {
      // Find the PDF canvas element
      const pdfContainer = pdfContainerRef.current;
      if (!pdfContainer) {
        console.error("PDF container not found");
        setIsCapturingSelection(false);
        return;
      }

      // react-pdf renders to a canvas inside the Document/Page components
      const canvas = pdfContainer.querySelector('canvas');
      if (!canvas) {
        console.error("PDF canvas not found");
        setIsCapturingSelection(false);
        return;
      }

      // Get the selection bounds (already in PDF coordinates, need to scale by zoom)
      const { x, y, width, height } = selection.bounds;
      const scale = selection.zoom || 1;
      
      // Create a temporary canvas to crop the selection
      const cropCanvas = document.createElement('canvas');
      const cropCtx = cropCanvas.getContext('2d');
      
      // Set crop canvas size to selection size
      cropCanvas.width = Math.max(width * scale, 50);
      cropCanvas.height = Math.max(height * scale, 50);
      
      // Draw the cropped region
      cropCtx.drawImage(
        canvas,
        x * scale,  // source x
        y * scale,  // source y
        width * scale,  // source width
        height * scale,  // source height
        0,  // dest x
        0,  // dest y
        cropCanvas.width,  // dest width
        cropCanvas.height  // dest height
      );
      
      // Convert to base64
      const imageBase64 = cropCanvas.toDataURL('image/png', 0.8);
      setCapturedSelectionImage(imageBase64);
      
      // Add system message showing capture success
      setConversation(prev => [...prev, {
        role: "system",
        content: `📍 Selected area captured from page ${selection.page}. Analyzing...`,
        timestamp: new Date().toISOString()
      }]);
      
      // Auto-send the explanation request with the captured image
      setInputText("Explain what is in this selected area");
      
      // Small delay then auto-send
      setTimeout(() => {
        sendExplanationWithImage(imageBase64, selection);
      }, 500);
      
    } catch (err) {
      console.error("Error capturing selection:", err);
      setConversation(prev => [...prev, {
        role: "system",
        content: `❌ Could not capture selection. Please try again.`,
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setIsCapturingSelection(false);
    }
  }, []);

  // Send explanation request WITH captured image
  const sendExplanationWithImage = async (imageBase64, selection) => {
    if (!sessionId) return;
    
    setIsProcessing(true);
    setInputText("");

    setConversation(prev => [...prev, {
      role: "technician",
      content: "Explain what is in this selected area",
      timestamp: new Date().toISOString(),
      attachments: [{ name: "diagram_selection.png", type: "image" }]
    }]);

    try {
      const diagramContext = {
        loaded: true,
        filename: pdfFileName,
        totalPages: numPages,
        currentPage: currentPage,
        sourceType: "pdf",
        selectedRegion: {
          page: selection.page,
          bounds: selection.bounds,
        },
        // Include the actual captured image
        selectionImage: imageBase64,
      };

      const chatRes = await fetch(`${API_URL}/api/diagnostic/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          session_id: sessionId, 
          transcript: "Explain what components, wires, or symbols are visible in this selected diagram area. Describe exactly what you see.",
          context: "diagram_assistance",
          diagram_context: diagramContext,
          mode: "teaching",
        })
      });

      if (!chatRes.ok) throw new Error("Chat request failed");
      const chatData = await chatRes.json();

      setConversation(prev => [...prev, {
        role: "alexis",
        content: chatData.response,
        timestamp: new Date().toISOString()
      }]);

      if (chatData.overlayCommands) {
        setOverlayCommands(chatData.overlayCommands);
      }
      
      speakResponse(chatData.response);
      
    } catch (err) {
      console.error("Chat error:", err);
      setConversation(prev => [...prev, {
        role: "alexis",
        content: "I encountered an error analyzing the selection. Please try again.",
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setIsProcessing(false);
      setVoiceState("IDLE");
    }
  };

  // Initialize session
  useEffect(() => {
    initSession();
  }, []);

  // ESC key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation]);

  // Clean up teaching mode on unmount
  useEffect(() => {
    return () => {
      disableDiagramTeaching();
    };
  }, [disableDiagramTeaching]);

  const initSession = async () => {
    try {
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
      setSessionId(sessionData.session_id);
    } catch (err) {
      console.error("Session init error:", err);
    }
  };

  // Handle file selection
  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setPdfError(null);
    setPdfFile(file);
    setPdfFileName(file.name);
    setNumPages(null);
    setCurrentPage(1);
    setScale(1.2); // Start at 120% for better readability
    setOverlayCommands([]);

    enableDiagramTeaching({
      filename: file.name,
      fileSize: file.size,
      totalPages: null,
      currentPage: 1,
    });

    // Add system message
    setConversation(prev => [...prev, {
      role: "system",
      content: `Wiring diagram loaded: ${file.name}`,
      timestamp: new Date().toISOString()
    }]);

    // Auto-enter fullscreen when diagram loads
    setIsFullscreen(true);
  };

  const onDocumentLoadSuccess = ({ numPages: pages }) => {
    setNumPages(pages);
    setPdfError(null);
    updateDiagramPages(pages);
  };

  const onDocumentLoadError = (error) => {
    console.error("PDF load error:", error);
    setPdfError("Failed to load PDF. Please try another file.");
  };

  const handleZoomIn = () => setScale((s) => Math.min(s + 0.2, 4.0));
  const handleZoomOut = () => setScale((s) => Math.max(s - 0.2, 0.3));
  const handlePrevPage = () => {
    const newPage = Math.max(currentPage - 1, 1);
    setCurrentPage(newPage);
    updateDiagramPage(newPage);
  };
  const handleNextPage = () => {
    const newPage = Math.min(currentPage + 1, numPages || 1);
    setCurrentPage(newPage);
    updateDiagramPage(newPage);
  };

  const handleDiagramTap = (event) => {
    if (!pdfContainerRef.current || !numPages) return;

    const rect = pdfContainerRef.current.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;

    const pdfX = localX / scale;
    const pdfY = localY / scale;

    const tapContext = {
      page: currentPage,
      x: pdfX,
      y: pdfY,
      zoom: scale,
      viewport: {
        width: rect.width / scale,
        height: rect.height / scale,
        offsetX: (pdfContainerRef.current.scrollLeft || 0) / scale,
        offsetY: (pdfContainerRef.current.scrollTop || 0) / scale,
      },
    };

    setOverlayCommands([]);
    window.__ALEXIS_DIAGRAM_TAP_CONTEXT__ = tapContext;
  };

  const clearPdf = () => {
    setPdfFile(null);
    setPdfFileName("");
    setNumPages(null);
    setCurrentPage(1);
    setOverlayCommands([]);
    setIsFullscreen(false);
    disableDiagramTeaching();
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // Browser-based TTS for ALEXIS responses
  const speakResponse = (text) => {
    const cleanText = text.replace(/\*\*/g, '').replace(/\*/g, '').replace(/#/g, '');
    
    const speakWithVoice = () => {
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.lang = 'en-US';
      
      const voices = window.speechSynthesis.getVoices();
      let selectedVoice = voices.find(v => v.name.includes('Microsoft Ava'));
      if (!selectedVoice) selectedVoice = voices.find(v => v.name.includes('Google') && v.lang.startsWith('en'));
      if (!selectedVoice) selectedVoice = voices.find(v => v.lang.startsWith('en'));
      if (selectedVoice) utterance.voice = selectedVoice;
      
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    };

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      speakWithVoice();
    } else {
      window.speechSynthesis.onvoiceschanged = speakWithVoice;
      setTimeout(speakWithVoice, 500);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // VOICE INPUT - Same as Voice Diagnostics
  // ═══════════════════════════════════════════════════════════════════════
  
  const startVoiceRecording = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setConversation(prev => [...prev, {
        role: "system",
        content: "Browser speech recognition not supported. Please type your message.",
        timestamp: new Date().toISOString()
      }]);
      return;
    }

    accumulatedTranscriptRef.current = "";

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setVoiceState("USER_SPEAKING");
    };

    recognition.onresult = (event) => {
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }

      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      
      if (finalTranscript) {
        accumulatedTranscriptRef.current += " " + finalTranscript;
        setInputText(accumulatedTranscriptRef.current.trim());
      }

      // Auto-send after 1.5s silence
      silenceTimeoutRef.current = setTimeout(() => {
        const transcript = accumulatedTranscriptRef.current.trim();
        if (transcript && voiceState === "USER_SPEAKING") {
          if (recognitionRef.current) {
            recognitionRef.current.stop();
          }
          autoSendVoiceMessage(transcript);
        }
      }, 1500);
    };

    recognition.onerror = (event) => {
      if (event.error !== 'aborted') {
        setVoiceState("IDLE");
      }
    };

    recognition.onend = () => {
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }
      const transcript = accumulatedTranscriptRef.current.trim();
      if (transcript && voiceState === "USER_SPEAKING") {
        autoSendVoiceMessage(transcript);
      } else if (voiceState === "USER_SPEAKING") {
        setVoiceState("IDLE");
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopVoiceRecording = () => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
  };

  const autoSendVoiceMessage = async (transcript) => {
    if (!transcript || !sessionId) {
      setVoiceState("IDLE");
      return;
    }
    setVoiceState("PROCESSING");
    setInputText(transcript);
    await new Promise(r => setTimeout(r, 300));
    await sendMessageWithText(transcript);
  };

  const toggleMic = () => {
    if (voiceState === "USER_SPEAKING") {
      stopVoiceRecording();
    } else if (voiceState === "IDLE" && sessionId) {
      startVoiceRecording();
    }
  };

  // Send message to ALEXIS (with optional text override for voice)
  const sendMessageWithText = async (text) => {
    const messageText = text || inputText.trim();
    if (!messageText || !sessionId) {
      setVoiceState("IDLE");
      return;
    }
    
    setIsProcessing(true);
    setInputText("");

    setConversation(prev => [...prev, {
      role: "technician",
      content: messageText,
      timestamp: new Date().toISOString()
    }]);

    try {
      const diagramContext = diagramMetadata?.loaded
        ? {
            loaded: true,
            filename: diagramMetadata.filename,
            totalPages: diagramMetadata.totalPages,
            currentPage: diagramMetadata.currentPage,
            selectedRegion: selectedRegion ? {
              page: selectedRegion.page,
              bounds: selectedRegion.bounds,
            } : null,
          }
        : null;

      const chatRes = await fetch(`${API_URL}/api/diagnostic/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          session_id: sessionId, 
          transcript: messageText,
          context: "diagram_assistance",
          diagram_context: diagramContext,
          tap_context: window.__ALEXIS_DIAGRAM_TAP_CONTEXT__ || null,
        })
      });

      if (!chatRes.ok) throw new Error("Chat request failed");
      const chatData = await chatRes.json();

      setConversation(prev => [...prev, {
        role: "alexis",
        content: chatData.response,
        timestamp: new Date().toISOString()
      }]);

      if (chatData.overlayCommands) {
        setOverlayCommands(chatData.overlayCommands);
      }
      
      speakResponse(chatData.response);
      
    } catch (err) {
      console.error("Chat error:", err);
      setConversation(prev => [...prev, {
        role: "alexis",
        content: "I encountered an error. Please try again.",
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setIsProcessing(false);
      setVoiceState("IDLE");
    }
  };

  // Send message to ALEXIS (original - for button click)
  const sendMessage = async () => {
    await sendMessageWithText(inputText.trim());
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // FULLSCREEN MODE RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  if (isFullscreen && pdfFile) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
        {/* Fullscreen Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800">
          <div className="flex items-center gap-4">
            <FileText className="h-5 w-5 text-cyan-400" />
            <span className="text-sm font-medium text-slate-200">{pdfFileName}</span>
            {diagramTeachingEnabled && (
              <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                Teaching Mode Active
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {/* Page controls */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePrevPage}
              disabled={currentPage <= 1}
              className="h-8 px-2 text-slate-300 hover:text-white disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-slate-300 min-w-[80px] text-center">
              Page {currentPage} of {numPages || "?"}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNextPage}
              disabled={currentPage >= (numPages || 1)}
              className="h-8 px-2 text-slate-300 hover:text-white disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            
            <div className="w-px h-6 bg-slate-700 mx-2" />
            
            {/* Zoom controls */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleZoomOut}
              className="h-8 w-8 p-0 text-slate-300 hover:text-white"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-sm text-slate-300 min-w-[50px] text-center">
              {Math.round(scale * 100)}%
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleZoomIn}
              className="h-8 w-8 p-0 text-slate-300 hover:text-white"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            
            <div className="w-px h-6 bg-slate-700 mx-2" />
            
            {/* Chat toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setChatPanelOpen(!chatPanelOpen)}
              className={`h-8 px-3 ${chatPanelOpen ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-300'}`}
            >
              <MessageSquare className="h-4 w-4 mr-1.5" />
              ALEXIS
            </Button>
            
            {/* Exit fullscreen */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsFullscreen(false)}
              className="h-8 px-3 text-slate-300 hover:text-white hover:bg-slate-700"
            >
              <Minimize2 className="h-4 w-4 mr-1.5" />
              Exit
            </Button>
          </div>
        </div>

        {/* Main content area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Diagram canvas - FULL WIDTH */}
          <div 
            ref={pdfContainerRef}
            className={`flex-1 overflow-auto bg-slate-950 flex items-start justify-center p-4 relative`}
          >
            {pdfError ? (
              <div className="text-red-400 text-lg py-8">{pdfError}</div>
            ) : (
              <div className="relative">
                <Document
                  file={pdfFile}
                  onLoadSuccess={onDocumentLoadSuccess}
                  onLoadError={onDocumentLoadError}
                  loading={
                    <div className="flex items-center gap-2 text-slate-400 py-8">
                      <span className="animate-spin text-2xl">⏳</span>
                      <span className="text-lg">Loading diagram...</span>
                    </div>
                  }
                >
                  <Page
                    pageNumber={currentPage}
                    scale={scale}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                  />
                </Document>

                {/* Interactive Overlay Canvas for visual teaching */}
                <DiagramOverlayCanvas
                  page={currentPage}
                  zoom={scale}
                  viewportOrigin={{ x: 0, y: 0 }}
                  overlayCommands={overlayCommands}
                  enableUserSelection={true}
                  onRegionSelect={handleRegionSelect}
                />
              </div>
            )}
          </div>

          {/* Floating Chat Panel */}
          {chatPanelOpen && (
            <div className="w-[400px] flex-shrink-0 flex flex-col bg-slate-900 border-l border-slate-800">
              {/* Chat header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-200">ALEXIS</span>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    TEACHING
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setChatPanelOpen(false)}
                  className="h-7 w-7 p-0 text-slate-400 hover:text-slate-200"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Visual interaction hint */}
              <div className="px-4 py-2 bg-cyan-900/20 border-b border-cyan-800/30">
                <p className="text-[10px] text-cyan-300">
                  💡 Click and drag on the diagram to select an area for ALEXIS to explain
                </p>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {conversation.map((msg, idx) => (
                  <div 
                    key={idx} 
                    className={`flex ${msg.role === "technician" ? 'justify-end' : 'justify-start'}`}
                  >
                    <div 
                      className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${
                        msg.role === "technician" 
                          ? 'bg-cyan-600/90 text-white' 
                          : msg.role === "system"
                            ? 'bg-slate-800/60 border border-slate-700/50 text-slate-400 text-xs'
                            : 'bg-slate-800/80 border border-slate-700/50 text-slate-100'
                      }`}
                    >
                      {msg.role === "alexis" && (
                        <p className="text-[9px] uppercase tracking-wider font-semibold text-cyan-400 mb-1">
                          ALEXIS
                        </p>
                      )}
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Input bar */}
              <div className="flex-shrink-0 p-3 border-t border-slate-800 bg-slate-900/95">
                <div className="flex items-end gap-2">
                  {/* Mic Button */}
                  <Button
                    variant="ghost"
                    onClick={toggleMic}
                    disabled={isProcessing || !sessionId}
                    className={`h-9 w-9 rounded-full p-0 flex-shrink-0 transition-all ${
                      voiceState === "USER_SPEAKING" 
                        ? 'bg-red-600 text-white animate-pulse' 
                        : 'bg-emerald-600 text-white hover:bg-emerald-500'
                    }`}
                    title={voiceState === "USER_SPEAKING" ? "Recording... (will auto-send)" : "Click to speak"}
                  >
                    {voiceState === "USER_SPEAKING" ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </Button>
                  
                  <Textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={voiceState === "USER_SPEAKING" ? "🎤 Listening..." : "Ask about the diagram..."}
                    className="flex-1 min-h-[36px] max-h-[100px] resize-none bg-slate-800/80 border-slate-700 rounded-xl text-sm text-slate-100 placeholder:text-slate-500 px-3 py-2"
                    disabled={isProcessing}
                  />
                  <Button
                    onClick={sendMessage}
                    disabled={isProcessing || !inputText.trim()}
                    className="h-9 w-9 p-0 bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-40 rounded-full"
                  >
                    {isProcessing ? "..." : <Send className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-[9px] text-slate-500 text-center mt-1.5">
                  {voiceState === "USER_SPEAKING" ? "🎤 Speak now... will auto-send after silence" : "Tap mic to speak • Enter to send"}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Fullscreen hint */}
        <div className="flex-shrink-0 px-4 py-1.5 bg-slate-900/80 border-t border-slate-800 text-center">
          <p className="text-[10px] text-slate-500">
            Press ESC to exit fullscreen • Tap diagram symbols to ask ALEXIS • Scroll to pan
          </p>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NORMAL MODE RENDER (ChatGPT-style with inline preview)
  // ═══════════════════════════════════════════════════════════════════════════
  const inlineContent = pdfFile ? (
    <div className="bg-slate-900/80">
      {/* PDF Header with controls */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700/50 bg-slate-800/50">
        <div className="flex items-center gap-3">
          <FileText className="h-4 w-4 text-slate-400" />
          <span className="text-sm text-slate-200 font-medium truncate max-w-[200px]">
            {pdfFileName}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomOut}
            className="h-7 w-7 p-0 text-slate-400 hover:text-slate-200"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs text-slate-400 min-w-[40px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomIn}
            className="h-7 w-7 p-0 text-slate-400 hover:text-slate-200"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>

          <div className="w-px h-5 bg-slate-700 mx-1" />
          
          {/* FULLSCREEN BUTTON */}
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleFullscreen}
            className="h-7 px-2 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10"
          >
            <Maximize2 className="h-4 w-4 mr-1" />
            <span className="text-xs">Fullscreen</span>
          </Button>
          
          {/* Close button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={clearPdf}
            className="h-7 w-7 p-0 text-slate-400 hover:text-red-400"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* PDF Canvas - Small preview */}
      <div 
        ref={!isFullscreen ? pdfContainerRef : null}
        className="relative overflow-auto max-h-[300px] flex items-center justify-center p-4 bg-slate-950/50 cursor-pointer"
        onClick={toggleFullscreen}
      >
        {pdfError ? (
          <div className="text-red-400 text-sm py-8">{pdfError}</div>
        ) : (
          <>
            <Document
              file={pdfFile}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={
                <div className="flex items-center gap-2 text-slate-400 py-8">
                  <span className="animate-spin">⏳</span>
                  <span className="text-sm">Loading diagram...</span>
                </div>
              }
            >
              <Page
                pageNumber={currentPage}
                scale={0.5} // Small preview scale
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />
            </Document>

            {/* Click to fullscreen overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 opacity-0 hover:opacity-100 transition-opacity">
              <div className="flex items-center gap-2 px-4 py-2 bg-cyan-600 rounded-lg text-white">
                <Maximize2 className="h-5 w-5" />
                <span className="font-medium">Open Fullscreen</span>
              </div>
            </div>
          </>
        )}
      </div>
      
      {/* Hint text */}
      <p className="text-[10px] text-slate-500 text-center py-2 border-t border-slate-800/50">
        Click diagram or Fullscreen button for detailed view
      </p>
    </div>
  ) : null;

  return (
    <div className="h-full flex flex-col bg-slate-950">
      {/* Scrollable conversation */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
          {/* Status */}
          <div className="flex items-center justify-center gap-3 py-2">
            <span className={`px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider ${
              sessionId 
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' 
                : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
            }`}>
              {sessionId ? "LIVE" : "Connecting..."}
            </span>
          </div>

          {/* Inline diagram preview */}
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
                      ? 'bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm'
                      : 'bg-slate-800/80 border border-slate-700/50 text-slate-100'
                }`}
              >
                {msg.role === "alexis" && (
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-cyan-400 mb-1.5">
                    ALEXIS
                  </p>
                )}
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Fixed input bar */}
      <div className="flex-shrink-0 border-t border-slate-800 bg-slate-900/95 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-end gap-2">
            {/* Upload button */}
            <Button
              variant="ghost"
              onClick={() => document.getElementById("wiring-pdf-input")?.click()}
              disabled={isProcessing}
              className="h-10 w-10 rounded-full p-0 flex-shrink-0 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            >
              <Plus className="h-5 w-5" />
            </Button>

            {/* Mic Button */}
            <Button
              variant="ghost"
              onClick={toggleMic}
              disabled={isProcessing || !sessionId}
              className={`h-10 w-10 rounded-full p-0 flex-shrink-0 transition-all ${
                voiceState === "USER_SPEAKING" 
                  ? 'bg-red-600 text-white animate-pulse' 
                  : 'bg-emerald-600 text-white hover:bg-emerald-500'
              }`}
              title={voiceState === "USER_SPEAKING" ? "Recording... (will auto-send)" : "Click to speak"}
            >
              {voiceState === "USER_SPEAKING" ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </Button>

            {/* Text Input */}
            <Textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={voiceState === "USER_SPEAKING" ? "🎤 Listening..." : "Message ALEXIS about the diagram..."}
              className="flex-1 min-h-[40px] max-h-[120px] resize-none bg-slate-800/80 border-slate-700 rounded-2xl text-sm text-slate-100 placeholder:text-slate-500 px-4 py-2.5"
              disabled={isProcessing}
            />

            {/* Send Button */}
            <Button
              onClick={sendMessage}
              disabled={isProcessing || !inputText.trim() || !sessionId}
              className="h-10 w-10 p-0 bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-40 rounded-full flex-shrink-0"
            >
              {isProcessing ? "..." : <Send className="h-4 w-4" />}
            </Button>
          </div>
          
          <p className="text-[10px] text-slate-600 text-center mt-2">
            {voiceState === "USER_SPEAKING" ? "🎤 Speak now... will auto-send after silence" : "Tap mic to speak • Enter to send • + to upload diagram"}
          </p>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        id="wiring-pdf-input"
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
};

export default WiringUploadPage;
