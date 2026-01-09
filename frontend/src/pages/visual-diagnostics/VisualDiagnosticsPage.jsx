import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Mic, MicOff, Volume2, AlertCircle, Camera, CameraOff, Image as ImageIcon } from "lucide-react";

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Context for this page - VISUAL INSPECTION
const PAGE_CONTEXT = "visual_inspection";

const VisualDiagnosticsPage = () => {
  const [selectedImage, setSelectedImage] = useState(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [conversation, setConversation] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [status, setStatus] = useState("Initializing...");
  const [sttError, setSttError] = useState(null);
  const [micReady, setMicReady] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const conversationEndRef = useRef(null);

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

  // Initialize session and arm microphone
  useEffect(() => {
    initSession();
    armMicrophone();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const armMicrophone = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      setMicReady(true);
    } catch (err) {
      setMicReady(false);
      setSttError("Microphone access denied.");
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
        setStatus("LIVE - Visual Inspection");
        
        // Initial ALEXIS greeting for visual inspection
        setConversation([{
          role: "alexis",
          text: "I'm ready to help you with visual inspection. You can:\n\n• Show me a component using your camera\n• Upload an image of the part you’re inspecting\n• Ask me to identify a component or connection\n• Request verification of proper installation\n\nWhat would you like me to look at?"
        }]);
      } else {
        setStatus("Offline");
      }
    } catch (err) {
      console.error("Session init error:", err);
      setStatus("Connection Failed");
    }
  };

  // Camera handlers
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      streamRef.current = stream;
      setIsCameraActive(true);
    } catch (err) {
      console.error("Camera error:", err);
      setSttError("Could not access camera. Check permissions.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const handleCaptureFrame = () => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/png");
    setSelectedImage(dataUrl);
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setSelectedImage(url);
  };

  // Voice handlers
  const startRecording = async () => {
    if (!sessionId) {
      setSttError("Session not ready.");
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
      setStatus("Listening...");
    } catch (err) {
      setSttError("Could not access microphone.");
      setMicReady(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setStatus("Processing...");
    }
  };

  const toggleMic = () => isRecording ? stopRecording() : startRecording();

  const processAudio = async (audioBlob) => {
    setIsProcessing(true);
    setSttError(null);
    
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");
      
      const sttRes = await fetch(`${API_URL}/api/stt`, { method: "POST", body: formData });
      
      if (!sttRes.ok) throw new Error("STT failed");
      
      const sttData = await sttRes.json();
      
      if (!sttData.transcript || sttData.transcript.trim() === "") {
        setSttError("No speech detected.");
        setStatus("LIVE - Visual Inspection");
        setIsProcessing(false);
        return;
      }
      
      setTranscript(sttData.transcript);
      await sendToAlexis(sttData.transcript);
      
    } catch (err) {
      setSttError(`Speech recognition failed: ${err.message}`);
      setStatus("LIVE - Visual Inspection");
    } finally {
      setIsProcessing(false);
    }
  };

  // Send to ALEXIS with VISUAL INSPECTION context
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
          context: PAGE_CONTEXT  // "visual_inspection"
        })
      });

      if (!chatRes.ok) throw new Error("Chat failed");
      const chatData = await chatRes.json();

      const alexisMessage = { role: "alexis", text: chatData.response };
      setConversation(prev => [...prev, alexisMessage]);
      setTranscript("");
      setStatus("ALEXIS is speaking...");

      await speakResponse(chatData.response);
    } catch (err) {
      setConversation(prev => [...prev, { role: "alexis", text: "Error: Could not process visual inspection request." }]);
      setStatus("LIVE - Visual Inspection");
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
            setStatus("LIVE - Visual Inspection");
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
    
    utterance.onend = () => { setIsSpeaking(false); setStatus("LIVE - Visual Inspection"); };
    utterance.onerror = () => { setIsSpeaking(false); setStatus("LIVE - Visual Inspection"); };
    window.speechSynthesis.speak(utterance);
  };

  const handleSend = () => {
    if (transcript.trim()) sendToAlexis(transcript);
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden text-slate-100">
      {/* Header */}
      <div className="flex-shrink-0 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-wide text-slate-100" data-testid="visual-diagnostics-title">
              Visual Diagnostics
            </h1>
            <p className="mt-1 text-sm text-slate-300/90">
              Vision-based component inspection with ALEXIS
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`px-3 py-1 rounded text-xs font-bold uppercase tracking-wider ${
                sessionId
                  ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                  : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40'
              }`}
              data-testid="visual-diagnostics-status"
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
        <div className="flex-shrink-0 mb-4 px-4 py-2 bg-red-900/30 border border-red-800/50 rounded-lg flex items-center gap-2" data-testid="visual-diagnostics-error-banner">
          <AlertCircle className="h-4 w-4 text-red-400" />
          <span className="text-sm text-red-300">{sttError}</span>
          <button onClick={() => setSttError(null)} className="ml-auto text-red-400 text-xs">Dismiss</button>
        </div>
      )}

      {/* Main content - 60/40 split */}
      <div className="flex-1 flex gap-4 overflow-hidden">
        {/* LEFT: Visual Canvas (60%) */}
        <div className="w-[60%] flex flex-col rounded-2xl border border-slate-700 bg-slate-950/90 overflow-hidden">
          {/* Canvas header */}
          <div className="flex-shrink-0 px-4 py-3 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">Visual Canvas</h2>
              <p className="text-xs text-purple-400/80 mt-0.5">Context: Component Inspection & Identification</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => document.getElementById("visual-file-input").click()}
                data-testid="visual-diagnostics-upload-button"
                className="h-8 px-3 bg-slate-800 border-slate-600 text-xs uppercase tracking-wider"
              >
                Upload Image
              </Button>
              <input
                id="visual-file-input"
                type="file"
                data-testid="visual-diagnostics-file-input"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={isCameraActive ? stopCamera : startCamera}
                data-testid="visual-diagnostics-camera-toggle-button"
                className={`h-8 px-3 ${isCameraActive ? 'bg-red-900/50 border-red-500/50' : 'bg-slate-800 border-slate-600'} text-xs uppercase tracking-wider`}
              >
                {isCameraActive ? <><CameraOff className="h-3 w-3 mr-1" /> Stop</> : <><Camera className="h-3 w-3 mr-1" /> Camera</>}
              </Button>
              {isCameraActive && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCaptureFrame}
                  className="h-8 px-3 bg-purple-900/50 border-purple-500/50 text-xs uppercase tracking-wider"
                >
                  Capture
                </Button>
              )}
            </div>
          </div>

          {/* Canvas display */}
          <div className="flex-1 p-4 flex items-center justify-center bg-slate-950">
            {isCameraActive ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="max-h-full max-w-full object-contain rounded-lg bg-black"
              />
            ) : selectedImage ? (
              <img
                src={selectedImage}
                alt="Visual inspection"
                className="max-h-full max-w-full object-contain rounded-lg"
              />
            ) : (
              <div className="text-center text-slate-500">
                <div className="mx-auto mb-3 h-16 w-16 rounded-2xl border border-slate-800 bg-slate-900/40 flex items-center justify-center">
                  <ImageIcon className="h-8 w-8 opacity-60" />
                </div>
                <p className="text-sm">Start camera or upload an image</p>
                <p className="text-xs text-slate-600 mt-1">ALEXIS will help identify components and check installation</p>
              </div>
            )}
          </div>

          <div className="flex-shrink-0 px-4 py-2 border-t border-slate-800 text-xs text-slate-500">
            Camera captures are processed in-browser only. Future: Multiple cameras, AI glasses support.
          </div>
        </div>

        {/* RIGHT: ALEXIS Conversation (40%) */}
        <div className="w-[40%] flex flex-col rounded-2xl border border-slate-700 bg-slate-950/90 overflow-hidden">
          {/* Header */}
          <div className="flex-shrink-0 px-4 py-3 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">ALEXIS - Visual Inspector</h2>
              <p className="text-xs text-purple-400/80 mt-0.5">Describe what you see or want checked</p>
            </div>
            <Button
              variant="outline"
              onClick={toggleMic}
              disabled={isProcessing || !sessionId}
              className={`h-12 w-12 rounded-full p-0 ${
                isRecording 
                  ? 'bg-red-600 border-red-500 text-white animate-pulse' 
                  : micReady
                    ? 'bg-slate-800 border-green-500/50 text-green-400'
                    : 'bg-slate-800 border-slate-600 text-slate-400'
              }`}
            >
              {isRecording ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </Button>
          </div>

          {/* Conversation */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {conversation.map((entry, idx) => (
              <div key={idx} className={`rounded-lg p-3 ${
                entry.role === "technician" 
                  ? 'bg-blue-900/30 border border-blue-800/50 ml-4' 
                  : 'bg-slate-800/50 border border-slate-700/50 mr-4'
              }`}>
                <p className={`text-[10px] uppercase tracking-wider font-semibold mb-1 ${
                  entry.role === "technician" ? 'text-blue-400' : 'text-purple-400'
                }`}>
                  {entry.role === "technician" ? "You" : "ALEXIS"}
                </p>
                <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">{entry.text}</p>
              </div>
            ))}
            <div ref={conversationEndRef} />
          </div>

          {/* Input */}
          <div className="flex-shrink-0 p-4 border-t border-slate-800 bg-slate-900/80">
            <div className="flex gap-2">
              <Textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }}}
                placeholder={isRecording ? "Listening..." : "Describe what you see or ask about a component..."}
                className="flex-1 min-h-[48px] max-h-[80px] resize-none bg-slate-950 border-slate-700 text-sm placeholder:text-slate-500"
              />
              <Button
                onClick={handleSend}
                disabled={isProcessing || !transcript.trim() || !sessionId}
                className="h-12 px-4 bg-purple-600 hover:bg-purple-500 text-white font-semibold uppercase tracking-wider text-xs disabled:opacity-40"
              >
                {isProcessing ? '...' : 'Ask'}
              </Button>
            </div>
            <p className="text-[10px] text-slate-500 mt-2">
              Ask ALEXIS to identify components, check installation, or spot anomalies in what you’re showing.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VisualDiagnosticsPage;
