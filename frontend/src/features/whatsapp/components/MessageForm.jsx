import { useMemo, useRef, useState } from "react";
import Button from "../../../shared/ui/Button.jsx";
import Card from "../../../shared/ui/Card.jsx";
import { MAX_MESSAGE_LENGTH } from "../constants.js";
import { sendWhatsAppMessage } from "../api/whatsappApi.js";
import { validateMessageForm } from "../lib/validation.js";
import { MESSAGE_TEMPLATES, findMessageTemplate } from "../messageTemplates.js";

export default function MessageForm({ onNotice }) {
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [errors, setErrors] = useState({});
  const [isSending, setIsSending] = useState(false);
  const firstErrorRef = useRef(null);

  const remaining = useMemo(() => MAX_MESSAGE_LENGTH - message.length, [message]);

  function handleTemplateChange(event) {
    const templateId = event.target.value;
    const template = findMessageTemplate(templateId);

    setSelectedTemplateId(templateId);

    if (template) {
      setMessage(template.body);
      setErrors((currentErrors) => ({ ...currentErrors, message: undefined }));
    }
  }

  function clearTemplate() {
    setSelectedTemplateId("");
    setMessage("");
    setErrors((currentErrors) => ({ ...currentErrors, message: undefined }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const nextErrors = validateMessageForm({ phone, message });
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      requestAnimationFrame(() => firstErrorRef.current?.focus());
      return;
    }

    setIsSending(true);
    onNotice(null);

    try {
      await sendWhatsAppMessage({ phone, message });
      setMessage("");
      onNotice({ type: "success", message: "Message sent successfully." });
    } catch (error) {
      onNotice({
        type: "error",
        message: error.message || "Network error. Check the backend and try again."
      });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <Card labelledBy="message-title">
      <div className="wa-card-heading">
        <div>
          <p className="wa-eyebrow">Message composer</p>
          <h2 id="message-title">Send a WhatsApp message</h2>
        </div>
      </div>

      <form className="wa-form" onSubmit={handleSubmit} noValidate>
        <div className="wa-field">
          <label htmlFor="message-template">Built-in message template</label>
          <div className="wa-template-row">
            <select
              id="message-template"
              name="messageTemplate"
              value={selectedTemplateId}
              onChange={handleTemplateChange}
              disabled={isSending}
            >
              <option value="">Write a custom message</option>
              {MESSAGE_TEMPLATES.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            <button type="button" className="wa-template-clear" onClick={clearTemplate} disabled={isSending || !message}>
              Clear
            </button>
          </div>
          <p className="wa-help">
            Choose a fixed Tameer.ai message, then edit it if needed before sending.
          </p>
        </div>

        <div className="wa-field">
          <label htmlFor="phone">Phone number</label>
          <input
            ref={errors.phone ? firstErrorRef : null}
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+923001234567"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            aria-invalid={Boolean(errors.phone)}
            aria-describedby={errors.phone ? "phone-error" : "phone-help"}
            disabled={isSending}
          />
          {errors.phone ? (
            <p id="phone-error" className="wa-error" tabIndex="-1">
              {errors.phone}
            </p>
          ) : (
            <p id="phone-help" className="wa-help">
              Include the country code. The backend formats it as phone@c.us.
            </p>
          )}
        </div>

        <div className="wa-field">
          <label htmlFor="message">Message</label>
          <textarea
            ref={!errors.phone && errors.message ? firstErrorRef : null}
            id="message"
            name="message"
            rows="7"
            placeholder="Type your message..."
            value={message}
            onChange={(event) => {
              setMessage(event.target.value);
              setSelectedTemplateId("");
            }}
            aria-invalid={Boolean(errors.message)}
            aria-describedby="message-meta"
            disabled={isSending}
          />
          <div id="message-meta" className="wa-field-meta">
            <span className={errors.message ? "wa-error" : "wa-help"}>
              {errors.message || "Line breaks and standard WhatsApp text are supported."}
            </span>
            <span className={remaining < 0 ? "wa-error" : "wa-help"}>{remaining} left</span>
          </div>
        </div>

        <Button type="submit" isLoading={isSending}>
          Send message
        </Button>
      </form>
    </Card>
  );
}
