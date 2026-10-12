---
version: alpha
name: "WhatsApp Sender Console"
description: "A compact operations dashboard for connecting a personal WhatsApp session and sending one-off messages."
colors:
  primary: "#1F6F5C"
  success: "#138A53"
  danger: "#B42318"
  warning: "#B76E00"
  background: "#F6F8F7"
  surface: "#FFFFFF"
  text: "#17211F"
  muted: "#66736F"
  border: "#D8E0DD"
  focus: "#2F80ED"
typography:
  sans:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
  mono:
    fontFamily: "SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace"
rounded:
  DEFAULT: "0.5rem"
  sm: "0.375rem"
  md: "0.5rem"
  lg: "0.75rem"
spacing:
  section-gap: "2rem"
  page-max: "64rem"
components:
  button: {}
  card: {}
  input: {}
  toast: {}
---

# WhatsApp Sender Console Design System

## Overview

The dashboard is a product surface for a single operator who needs to authenticate WhatsApp Web once, confirm connection state, and send deliberate one-off messages. The creative reference is a service console: calm status lights, dense but readable forms, and restrained surfaces that keep attention on connection state and message delivery.

The register is product/admin, not marketing. The memorable signature is the QR authentication panel behaving like a live instrument readout: status-first, direct, and stable. The interface should not look like a chat app clone, a promotional SaaS landing page, or a decorative green gradient screen.

## Colors

`primary` anchors actionable controls. `success`, `warning`, and `danger` are semantic status colors. Background, surface, border, text, and muted tokens keep the dashboard quiet and operational. Focus uses a separate blue token so keyboard state is never confused with success state.

## Typography

Use the sans stack for all interface text and the mono stack only for short technical values such as connection labels. Headings stay compact; form labels and status text should be easy to scan at desktop and mobile widths.

## Layout

Use a centered page with a maximum width near `page-max`. Authentication and message composition are single-column workflows on mobile and balanced two-column panels only when space allows. Loading, QR, success, and error regions reserve stable space so controls do not jump.

## Elevation & Depth

Use borders and tonal layers before shadows. Cards can use a subtle shadow only to separate the working surface from the page background.

## Shapes

Controls and cards use the default 8px radius. Avoid pill-heavy styling; this is an operations tool, not a social feed.

## Components

Buttons must preserve dimensions while busy and expose disabled states. Inputs require visible labels, associated error/help copy, and keyboard focus. Toasts/status messages use semantic color and live regions, but field-specific problems must remain inline.

## Do's and Don'ts

- **Do:** Keep status, QR, and sending states visible without layout jumps.
- **Do:** Prefer direct action labels like "Send message" and "Reconnect".
- **Don't:** Hide errors in transient notifications only.
- **Don't:** Use decorative WhatsApp-green gradients as the main visual identity.
