import React, { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import ALEXISConversationPanel from "@/components/ALEXISConversationPanel";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const WiringUploadPage = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(0.8);
  const [pdfError, setPdfError] = useState(null);
  const addSystemMessageRef = useRef(null);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPdfError(null);
    setSelectedFile(file);
    setNumPages(null);
    setCurrentPage(1);
    setScale(0.8);
    
    if (addSystemMessageRef.current) {
      addSystemMessageRef.current(`Wiring diagram loaded: ${file.name}`, [{ name: file.name, type: "pdf" }]);
    }
  };

  const onDocumentLoadSuccess = ({ numPages: pages }) => {
    setNumPages(pages);
    setPdfError(null);
  };

  const onDocumentLoadError = (error) => {
    console.error("PDF load error:", error);
    setPdfError("Failed to load PDF.");
  };

  const handleZoomIn = () => setScale((s) => Math.min(s + 0.2, 2.5));
  const handleZoomOut = () => setScale((s) => Math.max(s - 0.2, 0.4));
  const handlePrevPage = () => setCurrentPage((p) => Math.max(p - 1, 1));
  const handleNextPage = () => setCurrentPage((p) => Math.min(p + 1, numPages || 1));

  const handleAttachmentCallback = useCallback((addFn) => {
    addSystemMessageRef.current = addFn;
  }, []);

  // Compact Tools Panel for PDF
  const ToolsPanel = (
    <div className="px-4 py-3 bg-slate-900/50">
      <div className="flex items-center gap-3">
        {/* Compact PDF preview */}
        <div className="w-40 h-24 rounded border border-slate-700 bg-slate-950/50 overflow-hidden flex-shrink-0">
          {pdfError ? (
            <div className="w-full h-full flex items-center justify-center text-red-400 text-[10px] p-2 text-center">{pdfError}</div>
          ) : selectedFile ? (
            <div className="w-full h-full overflow-hidden flex items-center justify-center">
              <Document
                file={selectedFile}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={onDocumentLoadError}
                loading={<span className="text-slate-500 text-[10px]">Loading...</span>}
              >
                <Page 
                  pageNumber={currentPage} 
                  scale={0.15}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />
              </Document>
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 text-[10px]">
              <FileText className="h-4 w-4 mb-1" />
              No PDF
            </div>
          )}
        </div>
        
        {/* Controls */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => document.getElementById("pdf-input").click()}
              className="h-7 px-3 bg-slate-800 border-slate-600 text-[10px] uppercase tracking-wider"
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
              <span className="text-[10px] text-slate-400 truncate max-w-[120px]">{selectedFile.name}</span>
            )}
          </div>
          
          {numPages && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5 bg-slate-800/80 rounded px-1">
                <Button variant="ghost" size="sm" onClick={handleZoomOut} className="h-6 w-6 p-0 text-slate-300">
                  <ZoomOut className="h-3 w-3" />
                </Button>
                <span className="text-[10px] text-slate-400 w-8 text-center">{Math.round(scale * 100)}%</span>
                <Button variant="ghost" size="sm" onClick={handleZoomIn} className="h-6 w-6 p-0 text-slate-300">
                  <ZoomIn className="h-3 w-3" />
                </Button>
              </div>
              <div className="flex items-center gap-0.5 bg-slate-800/80 rounded px-1">
                <Button variant="ghost" size="sm" onClick={handlePrevPage} disabled={currentPage <= 1} className="h-6 w-6 p-0 text-slate-300 disabled:opacity-30">
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <span className="text-[10px] text-slate-400 w-10 text-center">{currentPage}/{numPages}</span>
                <Button variant="ghost" size="sm" onClick={handleNextPage} disabled={currentPage >= numPages} className="h-6 w-6 p-0 text-slate-300 disabled:opacity-30">
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      <ALEXISConversationPanel 
        context="WIRING_DIAGRAM_INTERPRETATION" 
        toolsPanel={ToolsPanel}
        onAttachment={handleAttachmentCallback}
      />
    </div>
  );
};

export default WiringUploadPage;
