import React, { useState, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Upload, X, Smartphone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import ALEXISConversationPanel from "@/components/ALEXISConversationPanel";

// Generate session code once at module load
const generateSessionCode = () => `ALEXIS-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;
const INITIAL_SESSION_CODE = generateSessionCode();

// QR Code Modal - defined outside component
const QRModal = ({ sessionCode, onClose, getMobileURL }) => (
  <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={onClose}>
    <div 
      className="bg-slate-900 border border-slate-600 rounded-xl p-6 max-w-sm mx-4"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-center mb-4">
        <h3 className="text-lg font-semibold text-slate-100 mb-2">Connect Mobile Camera</h3>
        <p className="text-sm text-slate-400">Scan this QR code with your phone to use it as a camera</p>
      </div>
      
      <div className="bg-white p-4 rounded-lg mb-4">
        <QRCodeSVG 
          value={getMobileURL} 
          size={200}
          level="H"
          className="mx-auto"
        />
      </div>
      
      <div className="text-center">
        <p className="text-xs text-slate-500 mb-3">Session: {sessionCode}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={onClose}
          className="bg-slate-800 border-slate-600 text-slate-200"
        >
          Close
        </Button>
      </div>
    </div>
  </div>
);

/**
 * Visual Diagnostics Page
 * ChatGPT-style layout with camera + QR code mobile linking
 */
const VisualDiagnosticsPage = () => {
  const [selectedImage, setSelectedImage] = useState(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const addSystemMessageRef = useRef(null);
  const sessionCode = INITIAL_SESSION_CODE;

  // Get the mobile camera URL
  const mobileURL = useMemo(() => {
    const baseURL = window.location.origin;
    return `${baseURL}/mobile-camera?session=${sessionCode}`;
  }, [sessionCode]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "environment" }, 
        audio: false 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      streamRef.current = stream;
      setIsCameraActive(true);
    } catch (err) {
      console.error("Camera error:", err);
      if (addSystemMessageRef.current) {
        addSystemMessageRef.current("Camera access denied. Use the QR code to connect your mobile device as a camera.", []);
      }
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
    stopCamera();
    
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

  const clearImage = () => {
    setSelectedImage(null);
  };

  // Inline content that appears IN the conversation stream
  const inlineContent = (
    <div className="p-4">
      {/* Camera view when active */}
      {isCameraActive && (
        <div className="relative mb-3">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full max-h-64 rounded-lg object-cover bg-black"
          />
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
            <Button
              onClick={handleCaptureFrame}
              className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-full text-sm"
            >
              Capture
            </Button>
            <Button
              onClick={stopCamera}
              variant="outline"
              className="bg-slate-800/90 border-slate-600 text-slate-200 px-4 py-2 rounded-full text-sm"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Captured/uploaded image preview */}
      {selectedImage && !isCameraActive && (
        <div className="relative inline-block mb-3">
          <img 
            src={selectedImage} 
            alt="Visual inspection" 
            className="max-h-64 rounded-lg object-contain"
          />
          <button
            onClick={clearImage}
            className="absolute top-2 right-2 bg-slate-900/80 hover:bg-slate-800 text-slate-300 rounded-full p-1.5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Controls row - always visible */}
      {!isCameraActive && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => document.getElementById("visual-file-input").click()}
            className="bg-slate-800 border-slate-600 text-slate-200 text-xs"
          >
            <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload Image
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={startCamera}
            className="bg-slate-800 border-slate-600 text-slate-200 text-xs"
          >
            <Camera className="h-3.5 w-3.5 mr-1.5" /> Use Camera
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowQRModal(true)}
            className="bg-cyan-900/50 border-cyan-600/50 text-cyan-200 text-xs hover:bg-cyan-800/50"
          >
            <Smartphone className="h-3.5 w-3.5 mr-1.5" /> Mobile Camera
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="h-full">
      <ALEXISConversationPanel 
        context="visual_inspection" 
        onAttachment={handleAttachmentCallback}
        inlineContent={inlineContent}
        onUploadClick={() => document.getElementById("visual-file-input")?.click()}
      />

      {/* Hidden file input */}
      <input
        id="visual-file-input"
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* QR Code Modal */}
      {showQRModal && (
        <QRModal 
          sessionCode={sessionCode} 
          onClose={() => setShowQRModal(false)} 
          getMobileURL={mobileURL}
        />
      )}
    </div>
  );
};

export default VisualDiagnosticsPage;
