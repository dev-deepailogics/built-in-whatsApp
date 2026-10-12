import { useCallback, useEffect, useRef, useState } from "react";
import { createWhatsAppEventSource, getWhatsAppStatus } from "../api/whatsappApi.js";
import { INITIAL_WHATSAPP_STATE } from "../constants.js";

export default function useWhatsAppConnection() {
  const [whatsAppState, setWhatsAppState] = useState(INITIAL_WHATSAPP_STATE);
  const [connectionIssue, setConnectionIssue] = useState("");
  const hasLoadedInitialStatus = useRef(false);

  const refreshStatus = useCallback(async () => {
    try {
      const status = await getWhatsAppStatus();

      setWhatsAppState(status);
      setConnectionIssue("");
    } catch (error) {
      setConnectionIssue(error.message || "Backend is unavailable.");
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedInitialStatus.current) {
      hasLoadedInitialStatus.current = true;
      refreshStatus();
    }

    const source = createWhatsAppEventSource();

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
  }, [refreshStatus]);

  return {
    whatsAppState,
    connectionIssue,
    refreshStatus
  };
}
