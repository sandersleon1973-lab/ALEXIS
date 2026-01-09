import React, { createContext, useContext, useState, useCallback } from "react";

const DiagramTeachingContext = createContext(null);

export const DiagramTeachingProvider = ({ children }) => {
  const [diagramTeachingEnabled, setDiagramTeachingEnabled] = useState(false);
  const [responseMode, setResponseMode] = useState("EXPLANATION");
  
  // NEW: Full diagram metadata for ALEXIS context binding
  const [diagramMetadata, setDiagramMetadata] = useState({
    loaded: false,
    filename: null,
    fileSize: null,
    totalPages: null,
    currentPage: 1,
    loadedAt: null,
  });

  const enableDiagramTeaching = useCallback((metadata = {}) => {
    setDiagramTeachingEnabled(true);
    setResponseMode("DIAGRAM_TEACHING");
    setDiagramMetadata({
      loaded: true,
      filename: metadata.filename || null,
      fileSize: metadata.fileSize || null,
      totalPages: metadata.totalPages || null,
      currentPage: metadata.currentPage || 1,
      loadedAt: new Date().toISOString(),
    });
  }, []);

  const updateDiagramPage = useCallback((page) => {
    setDiagramMetadata(prev => ({
      ...prev,
      currentPage: page
    }));
  }, []);

  const updateDiagramPages = useCallback((totalPages) => {
    setDiagramMetadata(prev => ({
      ...prev,
      totalPages
    }));
  }, []);

  const disableDiagramTeaching = useCallback(() => {
    setDiagramTeachingEnabled(false);
    setResponseMode("EXPLANATION");
    setDiagramMetadata({
      loaded: false,
      filename: null,
      fileSize: null,
      totalPages: null,
      currentPage: 1,
      loadedAt: null,
    });
  }, []);

  return (
    <DiagramTeachingContext.Provider
      value={{
        diagramTeachingEnabled,
        responseMode,
        setResponseMode,
        enableDiagramTeaching,
        disableDiagramTeaching,
        diagramMetadata,
        updateDiagramPage,
        updateDiagramPages,
      }}
    >
      {children}
    </DiagramTeachingContext.Provider>
  );
};

export const useDiagramTeaching = () => {
  const ctx = useContext(DiagramTeachingContext);
  if (!ctx) {
    throw new Error("useDiagramTeaching must be used within a DiagramTeachingProvider");
  }
  return ctx;
};
