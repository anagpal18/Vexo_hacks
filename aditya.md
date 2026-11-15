# Aditya — Frontend (Hub page + Family dashboard)

The design is yours. This file gives you **routes, data and the moments that must look great**. Messages and types are in `README.md` §2–4; use them exactly. Stack suggestion: Vite + React + TS on `http://localhost:5173`. **No iOS app.** The dashboard is a responsive web page (it must look good on an iPhone), and the hub runs in **Chrome on the laptop**.

Start on **mock data** (a static `Snapshot` + a fake event timer). Switch to the real WebSocket when Kenil's server is up (~4:00).

---

## Routes
| Route | Screen | Data |
|---|---|---|
| `/hub` | **Hub (Grandma's side, laptop at her place)** | `ws /ws/hub` + Shresth's band bridge |
| `/` | **Family dashboard (Priya's phone/laptop)**, the hero screen | `GET /api/state`, then `ws /ws/family` |
| `/doc/:id` | **Doctor's note review** | `GET /api/documents/:id`, `POST /approve` |
| `/debug` | Hidden demo panel (backup buttons) | `/api/demo/*` |

## `/hub`: calm, huge, readable from across a room
- **Connect band** button (it must be a click; Chrome opens the device chooser) → Shresth's `connectBand()` + `startStreaming(ws)`. Show band status.
- A **giant clock** (demo clock from the `clock` messages) and the date.
- **Next reminder** card from `next` ("4:00 PM · Blood pressure pill").
- On `speak`: play `new Audio(audioUrl)` (fallback `speechSynthesis.speak(new SpeechSynthesisUtterance(text))`), and show the text big with a pulsing speaker icon. For `fall_check`, use a full-screen amber "Are you okay? Double-tap your band." with a 30 s countdown ring.
- A small live transcript line at the bottom (demo only).
- **Unlock audio:** browsers block audio until a click, so the Connect button click also plays a silent sound once.

## `/`: family dashboard, judges must *feel* this one
1. **Status hero** (top, full width), colored by `snapshot.status`:
   - green "Mom is doing well"
   - amber "Needs a check"
   - red "Urgent"
   - plus `statusLine` ("last heard 2 min ago") and a band-connected dot
   - Animate color changes; the red flip during the fall is a key moment.
2. **Today timeline** (the main visual): a vertical list of tasks by `dueAt`.
   - Each row has a time, title, kind icon, and a status chip: ✓ confirmed (green) / ~ likely (amber) / ⏳ pending / 🔔 reminded (attempt n) / ✗ missed (red) / ⚠ needs review.
   - **Under each row, the quote**, styled like speech: *"Yes dear, took it"*, with a source badge: 🎙 from Mom's words / 📄 from Dr.'s note / ✍️ added by you.
   - New tasks slide in; status changes animate. This is where the loop becomes visible.
3. **Alerts + concerns feed** (right column, or below on mobile): urgent alerts big and red with "sent to iMessage ✓ · email ✓"; warn alerts amber; info items grey.
4. **Activity card:** steps today (big number) + a sparkline from `activity.series` + current state (still/walk).
5. **Ask about Mom:** an input → `POST /api/ask` → answer bubble with citation chips (click → scroll to that event).
6. **Upload doctor's note:** drag-drop or a camera button (`<input type="file" accept="image/*,application/pdf" capture="environment">` works on iPhone) → `POST /api/documents` → go to `/doc/:id`.
7. **Evening digest** button → `POST /api/digest` → show it in a nice card ("Emailed to Priya ✓").
8. A **live transcript drawer** (collapsed, demo only).

## `/doc/:id`: the review screen (a Gemini document-understanding moment)
- Left: the note image (`previewUrl`). Right: extracted cards (med / appointment / instruction), each with title, dose, times, **the `sourceLine` quoted**, a confidence bar (amber if < 0.6), and **Approve / Edit / Reject**.
- While `status === 'extracting'`, show a scanning shimmer over the image ("Gemini is reading the note…").
- An "Approve all" button → `POST /approve` → back to `/`, where the new tasks animate into the timeline.
- Top banner: "Nothing becomes a reminder until you approve it."

## `/debug` (hidden, only for us on stage)
Buttons: advance to 15:59 / 16:00 / 19:00 · `say` text box · fake `free-fall` · fake `double-tap` · reset · digest.

## Order of work
1. `/` on mock data: status hero + timeline + alerts (by 4:15)
2. `/hub` with the Connect button + speak playback (by 4:30 checkpoint)
3. Real WebSockets everywhere + animations (4:30–4:50)
4. Upload + `/doc/:id` + Ask + digest (4:50–5:10)
5. 5:10–5:15: mobile check on a real iPhone (the dashboard opened via the laptop's LAN IP), big fonts, freeze
