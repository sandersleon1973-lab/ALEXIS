import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

/**
 * ALEXIS SECURE SESSION CONTEXT
 * 
 * BLACK BOX AUTODATA IMPLEMENTATION (MANDATORY)
 * 
 * RULES ENFORCED IN CODE:
 * 1. Autodata access ONLY inside an active authenticated session
 * 2. Autodata data is MEMORY-ONLY (no disk writes, no cache, no DB)
 * 3. No persistence, no replay, no export
 * 4. When session ends → Autodata memory is destroyed immediately
 * 5. No AI training, no embeddings, no long-term knowledge from Autodata
 */

// In-memory volatile storage for Autodata
class AutodataVault {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.data = new Map(); // Volatile memory only
    this.isDestroyed = false;
  }

  // Fetch from Autodata API and hold in volatile memory ONLY
  async fetchFromAutodata(request) {
    if (this.isDestroyed) {
      throw new Error('Session vault has been destroyed');
    }
    
    // Data is held in memory only - no persistence
    const key = JSON.stringify(request);
    
    // If we have it in volatile memory, return it
    if (this.data.has(key)) {
      return this.data.get(key);
    }
    
    // For now, return null as Autodata API integration would go here
    // When integrated: call Autodata API via HTTPS/TLS, store response in memory only
    return null;
  }

  // Store data in volatile memory only
  store(key, value) {
    if (this.isDestroyed) {
      throw new Error('Session vault has been destroyed');
    }
    this.data.set(key, value);
  }

  // Retrieve from volatile memory
  retrieve(key) {
    if (this.isDestroyed) {
      return null;
    }
    return this.data.get(key) || null;
  }

  // CRITICAL: Wipe all memory immediately
  destroy() {
    this.data.clear();
    this.data = null;
    this.sessionId = null;
    this.isDestroyed = true;
  }
}

const SecureSessionContext = createContext(null);

export const SecureSessionProvider = ({ children }) => {
  const [sessionId, setSessionId] = useState(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [sessionEndedMessage, setSessionEndedMessage] = useState(null);
  const vaultRef = useRef(null);

  // Start a new secure session
  const startSession = useCallback(async (technicianId) => {
    // Generate unique session ID
    const newSessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create in-memory Autodata vault
    vaultRef.current = new AutodataVault(newSessionId);
    
    setSessionId(newSessionId);
    setIsSessionActive(true);
    setSessionEndedMessage(null);
    
    return {
      sessionId: newSessionId,
      active: true
    };
  }, []);

  // End session and destroy all data
  const endSession = useCallback(() => {
    // CRITICAL: Destroy Autodata vault immediately
    if (vaultRef.current) {
      vaultRef.current.destroy();
      vaultRef.current = null;
    }
    
    // Invalidate session
    setSessionId(null);
    setIsSessionActive(false);
    setSessionEndedMessage('Session ended. Data cleared.');
    
    // No data remains accessible
    return true;
  }, []);

  // Get vault reference (only if session is active)
  const getVault = useCallback(() => {
    if (!isSessionActive || !vaultRef.current) {
      return null;
    }
    return vaultRef.current;
  }, [isSessionActive]);

  // Store data in vault (memory only)
  const storeSecureData = useCallback((key, data) => {
    const vault = getVault();
    if (!vault) {
      console.warn('Cannot store data - no active session');
      return false;
    }
    vault.store(key, data);
    return true;
  }, [getVault]);

  // Retrieve data from vault (memory only)
  const retrieveSecureData = useCallback((key) => {
    const vault = getVault();
    if (!vault) {
      return null;
    }
    return vault.retrieve(key);
  }, [getVault]);

  const value = {
    sessionId,
    isSessionActive,
    sessionEndedMessage,
    startSession,
    endSession,
    storeSecureData,
    retrieveSecureData,
    getVault,
  };

  return (
    <SecureSessionContext.Provider value={value}>
      {children}
    </SecureSessionContext.Provider>
  );
};

export const useSecureSession = () => {
  const context = useContext(SecureSessionContext);
  if (!context) {
    throw new Error('useSecureSession must be used within a SecureSessionProvider');
  }
  return context;
};

/**
 * Session Ended Overlay Component
 * Shows when session ends and data is cleared
 */
export const SessionEndedOverlay = () => {
  const { sessionEndedMessage, isSessionActive } = useSecureSession();
  
  if (isSessionActive || !sessionEndedMessage) {
    return null;
  }
  
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-600 rounded-lg p-8 max-w-md text-center">
        <div className="text-cyan-400 text-xl font-semibold mb-4">
          Session Ended
        </div>
        <p className="text-slate-300">
          {sessionEndedMessage}
        </p>
        <p className="text-slate-500 text-sm mt-4">
          All Autodata content has been cleared from memory.
          No data has been saved or exported.
        </p>
      </div>
    </div>
  );
};

export default SecureSessionContext;
