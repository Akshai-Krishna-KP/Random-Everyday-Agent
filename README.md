# AI Event Feedback Form Generator

Paste an event description and get a **real, ready-to-share Google Form** with questions tailored to the event's purpose, activities and technical setup.

**Live app:** `https://script.google.com/macros/s/AKfycbwYQdz3KNUU7c1eNcZjFXTgJiLhx7wK0glWQVYpusNDgSizKqS9O6VZCso1GMFEhiQ/exec`
**Drive Link** `https://drive.google.com/file/d/1X5FnpoRSy7-q8cC7_wtAgogNCmmB7JKL/view?usp=sharing`

## What it does
1. You describe the event (or click an example: Hackathon, Workshop, Wedding, Webinar).
2. AI detects the event type and designs 3-5 sections of questions covering:
   - **Purpose:** did the event meet its goal, plus a likelihood-to-recommend rating
   - **Activities:** a rating for each named session and a "favourite" checkbox (it never invents activities)
   - **Technical/logistics:** venue, AV, Wi-Fi, platform, registration, food and schedule, adapted to the event type
   - **Open feedback:** best part, what to improve, optional role question
3. You preview the questions, edit wording or remove any, then click **Create Google Form**.
4. You get the responder link, edit link and a linked Google Sheet for responses.

Extras: length (short/standard/detailed), tone (casual/formal), language, optional email collection.

## How it works
```
Event description -> Gemini 2.5 Flash (JSON mode) -> validate/repair JSON -> preview & edit -> FormApp builds the Form
```
- The LLM returns structured JSON from a prompt that enforces purpose, activities and technical coverage.
- `sanitize_()` fixes or drops bad question types and empty option lists, and the call retries up to 3 times.
- Apps Script `FormApp` creates the real Form and a linked Sheet.

## Tools
Google Apps Script (`FormApp`, `UrlFetchApp`, `HtmlService`), Gemini API (Google AI Studio), HTML/CSS/JS.

## Deploy it yourself
1. Create a project at script.google.com; add `Code.gs` and `index.html`.
2. Project Settings > Script Properties > add `GEMINI_KEY` (free key from aistudio.google.com).
3. Run `authorize` once and accept the permissions.
4. Deploy > New deployment > Web app > Execute as **Me**, Access **Anyone**.
