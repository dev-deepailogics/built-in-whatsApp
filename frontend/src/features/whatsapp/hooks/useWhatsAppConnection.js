import { useCallback, useEffect, useRef, useState } from "react";
import { createWhatsAppEventSource, getWhatsAppStatus, logoutWhatsApp, reconnectWhatsApp } from "../api/whatsappApi.js";
import { INITIAL_WHATSAPP_STATE } from "../constants.js";

export default function useWhatsAppConnection(sessionId) {
  const [whatsAppState, setWhatsAppState] = useState(INITIAL_WHATSAPP_STATE);
  const [connectionIssue, setConnectionIssue] = useState("");
  const hasLoadedInitialStatus = useRef(false);

  const refreshStatus = useCallback(async () => {
    try {
      const status = await getWhatsAppStatus(sessionId);

      setWhatsAppState(status);
      setConnectionIssue("");
    } catch (error) {
      setConnectionIssue(error.message || "Backend is unavailable.");
    }
  }, [sessionId]);

  const reconnect = useCallback(async () => {
    try {
      const response = await reconnectWhatsApp(sessionId);

      if (response.state) {
        setWhatsAppState(response.state);
      }

      setConnectionIssue("");
    } catch (error) {
      setConnectionIssue(error.message || "Could not reconnect WhatsApp.");
    }
  }, [sessionId]);

  const clearSession = useCallback(async () => {
    try {
      const response = await logoutWhatsApp(sessionId);

      if (response.state) {
        setWhatsAppState(response.state);
      }

      setConnectionIssue("");
    } catch (error) {
      setConnectionIssue(error.message || "Could not clear WhatsApp session.");
    }
  }, [sessionId]);

  useEffect(() => {
    hasLoadedInitialStatus.current = false;
    setWhatsAppState(INITIAL_WHATSAPP_STATE);
    setConnectionIssue("");

    if (!hasLoadedInitialStatus.current) {
      hasLoadedInitialStatus.current = true;
      refreshStatus();
    }

    const source = createWhatsAppEventSource(sessionId);

    source.addEventListener("whatsapp-state", (event) => {
      try {
        setWhatsAppState(JSON.parse(event.data));
        setConnectionIssue("");
      } catch {
        setConnectionIssue("Received an invalid status update from the backend.");
      }
    });

    source.onerror = () => {
      setConnectionIssue("Live connection lost. Retrying automatically...");
    };

    return () => source.close();
  }, [refreshStatus, sessionId]);

  return {
    whatsAppState,
    connectionIssue,
    refreshStatus,
    reconnect,
    clearSession
  };
}
