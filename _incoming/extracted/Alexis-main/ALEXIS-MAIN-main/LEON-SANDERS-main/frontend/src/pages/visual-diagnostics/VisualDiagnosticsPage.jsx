import React, { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Camera, CameraOff, Upload } from "lucide-react";
import ALEXISConversationPanel from "@/components/ALEXISConversationPanel";

const VisualDiagnosticsPage = () => {
  const [selectedImage, setSelectedImage] = useState(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const addSystemMessageRef = useRef(null);

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
    
    if (addSystemMessageRef.current) {
      addSystemMessageRef.current("Image captured from camera", [{ name: "camera_capture.png", type: "image" }]);
    }
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setSelectedImage(url);
    
    if (addSystemMessageRef.current) {
      addSystemMessageRef.current(`Image uploaded: ${file.name}`, [{ name: file.name, type: "image" }]);
    }
  };

  const handleAttachmentCallback = useCallback((addFn) => {
    addSystemMessageRef.current = addFn;
  }, []);

  // Compact Tools Panel
  const ToolsPanel = (
    <div className="px-4 py-3 bg-slate-900/50">
      <div className="flex items-center gap-3">
        {/* Compact preview */}
        <div className="w-32 h-20 rounded border border-slate-700 bg-slate-950/50 overflow-hidden flex-shrink-0">
          {isCameraActive ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          ) : selectedImage ? (
            <img src={selectedImage} alt="Preview" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-600 text-[10px]">
              No image
            </div>
          )}
        </div>
        
        {/* Controls */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => document.getElementById("visual-file-input").click()}
            className="h-8 px-3 bg-slate-800 border-slate-600 text-[10px] uppercase tracking-wider"
          >
            <Upload className="h-3 w-3 mr-1.5" /> Upload
          </Button>
          <input
            id="visual-file-input"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={isCameraActive ? stopCamera : startCamera}
            className={`h-8 px-3 ${isCameraActive ? 'bg-red-900/50 border-red-500/50 text-red-300' : 'bg-slate-800 border-slate-600'} text-[10px] uppercase tracking-wider`}
          >
            {isCameraActive ? <><CameraOff className="h-3 w-3 mr-1.5" /> Stop</> : <><Camera className="h-3 w-3 mr-1.5" /> Camera</>}
          </Button>
          {isCameraActive && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCaptureFrame}
              className="h-8 px-3 bg-cyan-900/50 border-cyan-500/50 text-cyan-300 text-[10px] uppercase tracking-wider"
            >
              Capture
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      <ALEXISConversationPanel 
        context="VISUAL_DIAGNOSTICS" 
        toolsPanel={ToolsPanel}
        onAttachment={handleAttachmentCallback}
      />
    </div>
  );
};

export default VisualDiagnosticsPage;
