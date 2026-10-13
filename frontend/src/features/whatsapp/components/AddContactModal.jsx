import { useEffect, useRef, useState } from "react";
import { addWhatsAppContact } from "../api/whatsappApi.js";
import { normalizePhoneDigits } from "../lib/validation.js";

export default function AddContactModal({ sessionId, initialName = "", initialPhone = "", onClose, onSaved }) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [syncToPhone, setSyncToPhone] = useState(true);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const nameRef = useRef(null);
  const isPhoneFetched = Boolean(initialPhone);

  useEffect(() => {
    nameRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleSubmit(event) {
    event.preventDefault();

    const trimmedName = name.trim();
    const digits = normalizePhoneDigits(phone);

    if (!trimmedName) {
      setError("Enter a name for this contact.");
      return;
    }

    if (digits.length < 8 || digits.length > 15) {
      setError("Enter the phone number with country code, using 8-15 digits.");
      return;
    }

    const [firstName, ...rest] = trimmedName.split(/\s+/);

    setIsSaving(true);
    setError("");

    try {
      const response = await addWhatsAppContact({
        sessionId,
        firstName,
        lastName: rest.join(" "),
        phone: digits,
        syncToPhone
      });
      onSaved(response.contact);
    } catch (saveError) {
      setError(saveError.message || "Could not save the contact.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="wa-modal-backdrop" role="presentation" onClick={onClose}>
      <form
        className="wa-contact-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-contact-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
        noValidate
      >
        <header className="wa-contact-modal-head">
          <h2 id="add-contact-title">New contact</h2>
          <button type="button" className="wa-icon-button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <label className="wa-contact-field">
          <span>Name</span>
          <input
            ref={nameRef}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Full name"
            autoComplete="off"
            disabled={isSaving}
          />
        </label>

        <label className="wa-contact-field">
          <span>Phone {isPhoneFetched ? <em>(fetched from chat)</em> : null}</span>
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+923001234567"
            autoComplete="off"
            disabled={isSaving}
          />
        </label>

        <label className="wa-contact-sync">
          <input
            type="checkbox"
            checked={syncToPhone}
            onChange={(event) => setSyncToPhone(event.target.checked)}
            disabled={isSaving}
          />
          <span>
            <strong>Sync contact to phone</strong>
            <small>This contact will be added to your phone's address book.</small>
          </span>
        </label>

        {error ? <p className="wa-error">{error}</p> : null}

        <footer className="wa-contact-modal-actions">
          <button type="button" className="wa-pill-button" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button type="submit" className="wa-pill-button primary" disabled={isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </button>
        </footer>
      </form>
    </div>
  );
}
