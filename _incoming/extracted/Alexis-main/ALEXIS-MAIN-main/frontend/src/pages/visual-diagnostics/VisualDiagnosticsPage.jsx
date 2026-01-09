import React, { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Camera, CameraOff, Upload, X } from "lucide-react";
import ALEXISConversationPanel from "@/components/ALEXISConversationPanel";

/**
 * Visual Diagnostics Page
 * ChatGPT-style layout: Single scrollable conversation stream + fixed input bar
 * Image preview appears INLINE in the conversation stream when uploaded/captured
 */
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
  const inlineContent = (selectedImage || isCameraActive) ? (
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
        <div className="relative inline-block">
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

      {/* Controls row */}
      {!isCameraActive && (
        <div className="flex items-center gap-2 mt-3">
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
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className="h-full">
      <ALEXISConversationPanel 
        context="VISUAL_DIAGNOSTICS" 
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
    </div>
  );
};

export default VisualDiagnosticsPage;
