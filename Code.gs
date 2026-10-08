// Tried in order; if one is retired (404) the next is used automatically.
const MODELS = ['gemini-flash-latest', 'gemini-3.5-flash', 'gemini-3.1-flash-lite'];
const TYPES = ['scale', 'multiple_choice', 'checkbox', 'dropdown', 'paragraph', 'text'];

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('AI Event Feedback Form Generator')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Run ONCE from the editor to grant permissions. */
function authorize() {
  const f = FormApp.create('auth-test');
  const s = SpreadsheetApp.create('auth-test');
  UrlFetchApp.fetch('https://www.google.com');
  DriveApp.getFileById(f.getId()).setTrashed(true);
  DriveApp.getFileById(s.getId()).setTrashed(true);
  Logger.log('Authorized OK');
}

/** Step 1: description -> validated question spec (shown in preview). */
function generateSpec(description, opts) {
  description = String(description || '').trim();
  if (description.length < 20) throw new Error('Please describe the event in a bit more detail (20+ characters).');
  opts = opts || {};
  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_KEY');
  if (!key) throw new Error('GEMINI_KEY is missing in Script Properties.');

  const payload = JSON.stringify({
    contents: [{ parts: [{ text: buildPrompt_(description.slice(0, 6000), opts) }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.6 }
  });

  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    const model = MODELS[attempt % MODELS.length];
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + key;
    try {
      const res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: payload, muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) {
        throw new Error(model + ' returned ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
      }
      let text = JSON.parse(res.getContentText()).candidates[0].content.parts[0].text;
      text = text.replace(/```json|```/g, '').trim();
      return sanitize_(JSON.parse(text));
    } catch (e) {
      lastErr = e;
      Logger.log('Attempt ' + (attempt + 1) + ' failed: ' + e.message);
      Utilities.sleep(700);
    }
  }
  throw new Error('Could not generate the form (' + lastErr.message + '). Please try again.');
}

function buildPrompt_(description, o) {
  const len = { short: '6-8', standard: '10-15', detailed: '16-22' }[o.length] || '10-15';
  return [
    'You are an expert event-feedback survey designer. Read the event description and design a feedback form tailored to it.',
    'Return ONLY JSON in this exact shape:',
    '{"eventType":"short label e.g. Hackathon","title":"form title","description":"1-2 friendly sentences",',
    '"sections":[{"title":"...","questions":[{"question":"...","type":"scale|multiple_choice|checkbox|dropdown|paragraph|text","options":["..."],"required":true,"low":"label for 1","high":"label for 5"}]}]}',
    '',
    'RULES',
    '- 3 to 5 sections, ' + len + ' questions in total. Mix question types.',
    '- PURPOSE section: did the event meet its stated goal(s)? Include a 1-5 "likelihood to recommend" scale.',
    '- ACTIVITIES section: one 1-5 scale question per activity/session/speaker explicitly named, plus a checkbox "Which did you enjoy most?" listing ONLY the named activities. NEVER invent activities.',
    '- TECHNICAL/LOGISTICS section: adapt to the event (venue, sound/AV, Wi-Fi, platform/stream quality, registration, food, schedule, tools, mentors, etc.) using only the details given or clearly implied by the event type.',
    '- Final section: 2-3 open-ended paragraph questions (best part, what to improve, other comments) and one OPTIONAL role/demographic multiple_choice question suited to this event.',
    '- Scale questions use type "scale" (1-5) with "low" and "high" labels. Choice questions need 3-6 options. Paragraph/text need no options.',
    '- Keep wording neutral and non-leading. Mark core questions required:true, open-ended ones required:false.',
    '- Tone: ' + (o.tone === 'formal' ? 'formal and professional' : 'friendly and casual') + '.',
    '- Write ALL user-facing text in ' + (o.language || 'English') + ' (JSON keys and type values stay in English).',
    '',
    'EVENT DESCRIPTION:',
    description
  ].join('\n');
}

/** Fix or drop anything invalid instead of crashing. */
function sanitize_(spec) {
  const out = {
    eventType: String(spec.eventType || 'Event').slice(0, 40),
    title: String(spec.title || 'Event Feedback').slice(0, 150),
    description: String(spec.description || 'Thanks for joining us! Your feedback helps us improve.').slice(0, 500),
    sections: []
  };
  (spec.sections || []).slice(0, 6).forEach(function (s) {
    const qs = [];
    (s.questions || []).forEach(function (q) {
      if (!q || !q.question) return;
      let type = TYPES.indexOf(q.type) > -1 ? q.type : 'text';
      let options = (q.options || []).map(String).filter(Boolean).slice(0, 10);
      if (['multiple_choice', 'checkbox', 'dropdown'].indexOf(type) > -1 && options.length < 2) type = 'paragraph';
      qs.push({ question: String(q.question).slice(0, 300), type: type, options: options,
        required: q.required === true, low: String(q.low || 'Poor').slice(0, 40), high: String(q.high || 'Excellent').slice(0, 40) });
    });
    if (qs.length) out.sections.push({ title: String(s.title || 'Section').slice(0, 100), questions: qs });
  });
  if (!out.sections.length) throw new Error('The AI returned no usable questions.');
  return out;
}

/** Step 2: (possibly edited) spec -> real Google Form + response Sheet. */
function createForm(spec, opts) {
  opts = opts || {};
  spec = sanitize_(spec);
  const form = FormApp.create(spec.title).setDescription(spec.description);
  try { form.setCollectEmail(!!opts.collectEmail); } catch (e) {}
  try { form.setRequireLogin(false); } catch (e) {}

  spec.sections.forEach(function (s, i) {
    if (i === 0) form.addSectionHeaderItem().setTitle(s.title);
    else form.addPageBreakItem().setTitle(s.title);
    s.questions.forEach(function (q) {
      let item;
      switch (q.type) {
        case 'scale': item = form.addScaleItem().setBounds(1, 5).setLabels(q.low, q.high); break;
        case 'multiple_choice': item = form.addMultipleChoiceItem().setChoiceValues(q.options); break;
        case 'checkbox': item = form.addCheckboxItem().setChoiceValues(q.options); break;
        case 'dropdown': item = form.addListItem().setChoiceValues(q.options); break;
        case 'paragraph': item = form.addParagraphTextItem(); break;
        default: item = form.addTextItem();
      }
      item.setTitle(q.question).setRequired(q.required);
    });
  });

  let sheetUrl = '';
  try {
    const ss = SpreadsheetApp.create('Responses - ' + spec.title);
    form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
    sheetUrl = ss.getUrl();
  } catch (e) {}

  return { formUrl: form.getPublishedUrl(), editUrl: form.getEditUrl(), sheetUrl: sheetUrl };
}
