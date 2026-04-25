/* =============================================
   VoterGuard AI — v3 Application Logic
   Prompt Template Engine:
     Auto-fills {{user_level}}, {{user_goal}},
     {{previous_topic}}, {{previous_style}},
     {{user_input}} from live state.
   Enforces 4-part structured output format.
   Rotates explanation STYLES to prevent repetition.
   ============================================= */

// ─── State ────────────────────────────────────
const state = {
  level:          'beginner',   // beginner | intermediate | advanced
  mode:           null,         // learn | mythbust | help
  step:           0,
  seenTopics:     {},           // topicKey → visit count
  seenMyths:      {},           // mythKey  → bust count
  confusionCount: 0,
  msgCount:       0,
  // ── Template context (updated before every response) ──
  ctx: {
    user_level:          'beginner',
    user_goal:           'none yet',
    previous_topic:      'none',
    previous_style:      'none',
    user_input:          '',
  },
};

// ─── Explanation Style Pool ───────────────────
// Rotation ensures {{previous_style}} is NEVER reused immediately
const STYLE_POOL = [
  'analogy',       // relatable comparison (movie ticket, library card, …)
  'story',         // narrative walkthrough — "Imagine it's election morning…"
  'step-by-step',  // numbered action list
  'Q&A',           // pose a question, then answer it
  'visual',        // heavy emoji layout, diagram-like
  'legal',         // statutes, sections, case law
  'conversational',// casual chat tone, short sentences
];

function pickStyle(avoidStyle) {
  const pool = STYLE_POOL.filter(s => s !== avoidStyle);
  return pool[Math.floor(Math.random() * pool.length)];
}

// ─── Prompt Template Engine ───────────────────
const PROMPT_TEMPLATE = `
User Profile:
- Level: {{user_level}}
- Goal: {{user_goal}}
- Previous Topic: {{previous_topic}}
- Previous Explanation Style: {{previous_style}}

Current User Input:
"{{user_input}}"

INSTRUCTIONS:
- Adapt explanation to the user level
- Do NOT repeat previous explanation style
- If similar topic, explain using a DIFFERENT analogy
- Keep response conversational and engaging
- If it's a claim → perform myth-busting
- If it's a problem → give actionable steps + script
- If user is confused → simplify further

OUTPUT FORMAT:
1. Short engaging intro
2. Clear explanation (step-by-step or analogy)
3. If needed: Truth classification | Action steps | Script
4. End with a follow-up question
`.trim();

/**
 * Fills the prompt template with live state values.
 * Returns the rendered string (used for routing decisions
 * and shown in the optional debug panel).
 */
function fillTemplate(userInput) {
  const ctx = state.ctx;
  ctx.user_level    = state.level;
  ctx.user_goal     = state.mode || 'general';
  ctx.user_input    = userInput;
  // previous_topic & previous_style updated by updateCtxAfterResponse()

  return PROMPT_TEMPLATE
    .replace(/{{user_level}}/g,          ctx.user_level)
    .replace(/{{user_goal}}/g,           ctx.user_goal)
    .replace(/{{previous_topic}}/g,      ctx.previous_topic)
    .replace(/{{previous_style}}/g,      ctx.previous_style)
    .replace(/{{user_input}}/g,          ctx.user_input);
}

/**
 * After each response, record what we just explained and which style
 * was used, so the next response can avoid repeating it.
 */
function updateCtxAfterResponse(topic, style) {
  state.ctx.previous_topic = topic || state.ctx.previous_topic;
  state.ctx.previous_style = style || state.ctx.previous_style;
}

/**
 * Wraps any response HTML in the 4-part structured output format:
 * 1. Engaging intro (caller provides as `intro`)
 * 2. Body content (caller provides as `body`)
 * 3. Optional: truth badge / action / script  (embedded in body by callers)
 * 4. Follow-up question (caller provides as `followUp`)
 *
 * All response helpers below use this as their final assembly step.
 */
function buildStructuredResponse({ intro, body, followUp }) {
  return [
    intro   ? `<div class="sr-intro">${intro}</div>` : '',
    body    ? `<div class="sr-body">${body}</div>` : '',
    followUp? `<div class="sr-followup">💬 ${followUp}</div>` : '',
  ].filter(Boolean).join('');
}

// ─── Confusion Keywords ────────────────────────
const CONFUSION_SIGNALS = [
  "don't understand", "dont understand", "confused", "confusing",
  "what?", "huh", "not clear", "unclear", "lost", "what does that mean",
  "explain again", "i don't get it", "i dont get it", "too complicated",
  "too hard", "what is", "what's that", "means what", "help me understand",
  "simpler", "simple please", "say that again",
];

// ─── Repetition check ─────────────────────────
function isRepeated(key) {
  return (state.seenTopics[key] || 0) > 0;
}

function markSeen(key) {
  state.seenTopics[key] = (state.seenTopics[key] || 0) + 1;
}

function getSeenCount(key) {
  return state.seenTopics[key] || 0;
}

function detectConfusion(text) {
  const lower = text.toLowerCase();
  return CONFUSION_SIGNALS.some(s => lower.includes(s));
}

// ─── Level helpers ────────────────────────────
function autoDowngrade() {
  if (state.level === 'advanced') { state.level = 'intermediate'; updateLevelBadge(); return true; }
  if (state.level === 'intermediate') { state.level = 'beginner'; updateLevelBadge(); return true; }
  return false; // already beginner
}

function updateLevelBadge() {
  const el = document.getElementById('level-badge');
  if (!el) return;
  el.textContent = state.level === 'beginner' ? '🌱 Beginner'
    : state.level === 'intermediate' ? '📋 Intermediate' : '⚖️ Advanced';
  // Flash animation
  el.classList.remove('flash');
  void el.offsetWidth; // reflow
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 700);
}


// ─── Step data ───────────────────────────────
const STEPS = [
  {
    id: 'registration',
    title: 'Voter Registration',
    emoji: '📝',
    // variant[0] = first time, variant[1] = repeated (fresh analogy)
    variants: {
      beginner: [
        `📝 <span class="step-badge">Step 1 of 5</span><br><br>
<strong>Voter Registration — What is it?</strong><br><br>
Think of it like signing up for a <em>sports team</em>. You can't play the match if your name isn't on the team sheet — same with voting! 🏏<br><br>
<strong>What you need:</strong>
<ul>
<li>✅ You must be 18+ years old</li>
<li>✅ Be a citizen of your country</li>
<li>✅ Have a fixed address</li>
</ul>
<strong>How to register:</strong>
<ul>
<li>👉 Go to your country's Election Commission website</li>
<li>👉 Fill your name, address, DOB and upload an ID photo</li>
<li>👉 You'll receive a <strong>Voter ID card</strong> within a few weeks!</li>
</ul><br>
🟢 Most democracies now allow online registration — just 10 minutes!`,

        `📝 <span class="step-badge">Step 1 of 5 — Fresh take!</span><br><br>
<strong>Registration — Let's try a different angle 🎬</strong><br><br>
Imagine you buy a ticket to a sold-out concert. Without that ticket, the security won't let you in — no matter how big a fan you are. Registration is your <em>ticket</em> to democracy!<br><br>
<strong>Why does it close early?</strong><br>
Officials need time to print the official voter list before election day. That's why the deadline is usually <strong>30–45 days before polling</strong>.<br><br>
<strong>Quick checklist:</strong>
<ul>
<li>🎫 Visit electoralsearch.eci.gov.in to check if you're already registered</li>
<li>📋 If not, fill <strong>Form 6</strong> at the EC portal or visit your BLO (Booth Level Officer)</li>
<li>📱 Or use the <strong>Voter Helpline App</strong> — it's free!</li>
</ul>`
      ],
      intermediate: [
        `📝 <span class="step-badge">Step 1 of 5</span><br><br>
<strong>Voter Registration</strong><br><br>
Registration adds you to the <em>electoral roll</em> — the official, verified list of voters in your constituency.<br><br>
<strong>Key eligible criteria:</strong>
<ul>
<li>Age 18+ as on January 1st of the election year</li>
<li>Indian citizen (or equivalent in your country)</li>
<li>Ordinarily resident at your stated address</li>
</ul>
<strong>How to register:</strong>
<ul>
<li>🌐 voters.eci.gov.in → New Voter Registration (Form 6)</li>
<li>🏢 In-person at Electoral Registration Officer (ERO) office</li>
<li>📱 Voter Helpline App</li>
</ul><br>
📌 <strong>Tip:</strong> Check the deadline – usually 30–45 days before polling day!`,

        `📝 <span class="step-badge">Step 1 of 5 — Different perspective</span><br><br>
<strong>Registration — What actually happens behind the scenes?</strong><br><br>
When you submit Form 6, the ERO verifies your address via a field visit or documentary evidence, then adds your entry to the draft electoral roll. There's a <em>claims & objections period</em> where anyone can dispute an entry. After that, the final roll is published.<br><br>
<strong>Types of registration forms:</strong>
<ul>
<li><strong>Form 6</strong> — New voter registration</li>
<li><strong>Form 6A</strong> — For citizens residing abroad</li>
<li><strong>Form 8</strong> — Corrections / address change</li>
<li><strong>Form 7</strong> — Deletion of deceased/shifted voter</li>
</ul><br>
📌 You can track your application status on the EC portal within 30 days.`
      ],
      advanced: [
        `📝 <span class="step-badge">Step 1 of 5</span><br><br>
<strong>Voter Registration — Legal Framework</strong><br><br>
Registration is a statutory right under <strong>Article 326</strong> of the Indian Constitution and <strong>Section 19</strong> of the Representation of People Act, 1950. It cannot be denied on grounds of religion, race, caste, sex, or place of birth.<br><br>
<strong>Forms & legal basis:</strong>
<ul>
<li><strong>Form 6</strong> — New registration under Rule 26 of Registration of Electors Rules, 1960</li>
<li><strong>Form 6A</strong> — Overseas voters under Section 20A, RP Act</li>
<li><strong>Form 8</strong> — Transposition / corrections</li>
</ul>
<strong>Timeline:</strong> Summary revision of rolls is done every year (Jan 1 qualifying date). Special Summary Revisions are triggered by election announcements. Rolls close typically 4–8 weeks before poll date.<br><br>
Any rejection by ERO can be appealed → Chief Electoral Officer → Election Commission.`,

        `📝 <span class="step-badge">Step 1 of 5 — Deeper layer</span><br><br>
<strong>Registration — Judicial & Administrative Dimensions</strong><br><br>
Beyond the basic RP Act framework, courts have repeatedly affirmed that denial of registration to an eligible voter constitutes violation of the constitutional right to participate in government.<br><br>
<strong>Key cases:</strong>
<ul>
<li><em>People's Union for Civil Liberties v. Union of India</em> (2003) — SC affirmed right to know about candidates as part of Article 19(1)(a)</li>
<li><em>Kuldip Nayar v. Union of India</em> (2006) — Upheld need for domicile link in voter registration</li>
</ul>
<strong>Booth Level Officer system:</strong> Each BLO oversees ~1,200 voters, handles on-ground verification, and is a direct link to the ERO. Engaging your BLO proactively is the fastest path to registration issues being resolved.`
      ]
    }
  },
  {
    id: 'voter-id',
    title: 'Voter ID Verification',
    emoji: '🪪',
    variants: {
      beginner: [
        `🪪 <span class="step-badge">Step 2 of 5</span><br><br>
<strong>Voter ID — Your Voting Passport 🛂</strong><br><br>
Just like you need a ticket to enter a movie, you need an ID to vote. It tells officials: "Yes, I am who I say I am!"<br><br>
<strong>IDs you can use:</strong>
<ul>
<li>🪪 Voter ID (EPIC) — most common</li>
<li>📘 Passport</li>
<li>🚗 Driving Licence</li>
<li>🏦 Aadhaar card</li>
<li>📋 MGNREGS job card</li>
</ul><br>
😊 <strong>No Voter ID card?</strong> Bring any one of the above — most booths accept 11+ alternatives!`,

        `🪪 <span class="step-badge">Step 2 of 5 — New angle!</span><br><br>
<strong>Voter ID — Think of it as your "democracy pass" 🎟️</strong><br><br>
Remember how you need a boarding pass at the airport? The voter ID is similar — it's proof you've <em>already been cleared</em> (registered) and now you're ready to board (vote)!<br><br>
<strong>What if you genuinely lost your ID?</strong>
<ul>
<li>📱 Download your <strong>e-EPIC</strong> (digital Voter ID) from voters.eci.gov.in — free and instant!</li>
<li>📄 Show it on your phone — it's legally valid</li>
<li>🏦 Alternatively, your bank passbook with photo also works</li>
</ul><br>
🔑 Pro tip: Save your e-EPIC on your phone right now — you'll never lose it!`
      ],
      intermediate: [
        `🪪 <span class="step-badge">Step 2 of 5</span><br><br>
<strong>Voter ID Verification</strong><br><br>
At the booth, officials cross-check your photo ID with the printed electoral roll before issuing a ballot.<br><br>
<strong>12 accepted documents in India (EC 2019 order):</strong>
<ul>
<li>EPIC, Aadhaar, PAN, Passport, Driving Licence</li>
<li>Service ID card with photo (Govt/PSU employees)</li>
<li>Bank/PO passbook with photo</li>
<li>MGNREGS Job Card, Health insurance smart card</li>
<li>Pension/disability documents with photo</li>
</ul>
📌 Even with a valid ID, if your name is not on the printed roll, you cannot vote normally — but you can request a <strong>Tendered Ballot</strong>.`,

        `🪪 <span class="step-badge">Step 2 of 5 — What really happens at verification?</span><br><br>
<strong>Behind the booth door</strong><br><br>
There are typically 4–5 officials at each polling booth, each assigned a specific job:<br>
<ul>
<li><strong>Official 1</strong> — Checks ink on your finger (haven't voted already)</li>
<li><strong>Official 2</strong> — Verifies name on electoral roll, asks you to sign/thumb</li>
<li><strong>Official 3</strong> — Issues the ballot serial number</li>
<li><strong>Official 4</strong> — Controls access to the EVM</li>
</ul><br>
📌 This multi-step process exists to prevent impersonation — each step is a security checkpoint!`
      ],
      advanced: [
        `🪪 <span class="step-badge">Step 2 of 5</span><br><br>
<strong>Voter Identification — Legal Context</strong><br><br>
ID requirements derive from the EC's Standing Instruction on use of ID documents (2004, amended 2019). The EPIC is <em>primary</em> but the EC circular mandates acceptance of 11 alternative documents to prevent disenfranchisement, especially of marginalized groups.<br><br>
<strong>Tendered ballot mechanism (Rule 49P, CER 1961):</strong> If voting has already been recorded in your name, you may apply for a Tendered Ballot to the Presiding Officer. It is kept separately and only counted if the original vote is proved fraudulent via investigation.<br><br>
<strong>Denial of voting rights — remedies:</strong>
<ul>
<li>Demand written reasons from Presiding Officer</li>
<li>Escalate to Returning Officer / designated observer</li>
<li>Lodge complaint on cVIGIL app or Voter Helpline 1950</li>
</ul>`,

        `🪪 <span class="step-badge">Step 2 — Deeper look at e-EPIC</span><br><br>
<strong>Digital Voter ID — The e-EPIC System</strong><br><br>
Launched in January 2021, e-EPIC (Electronic Electoral Photo Identity Card) is a non-editable digital PDF of the standard Voter ID. Legally recognized under Section 25A of the RP Act as amended.<br><br>
<strong>Key features:</strong>
<ul>
<li>Downloadable from voters.eci.gov.in or Voter Helpline App</li>
<li>Contains QR code linked to Electoral Roll entry</li>
<li>Accepted on mobile screen as valid ID at polling booths</li>
<li>Cannot be self-printed to be used as physical ID (must be official laminated EPIC for that)</li>
</ul><br>
<strong>Security:</strong> Each e-EPIC has a unique identifier cross-linked with the ERONET database, making forgery detectable by booth scanning systems in modernised booths.`
      ]
    }
  },
  {
    id: 'polling-booth',
    title: 'Finding Your Polling Booth',
    emoji: '📍',
    variants: {
      beginner: [
        `📍 <span class="step-badge">Step 3 of 5</span><br><br>
<strong>Finding Your Polling Booth 🗺️</strong><br><br>
Every voter has one specific booth assigned to them — like your assigned seat in class. You can't vote at just any booth!<br><br>
<strong>How to find your booth:</strong>
<ul>
<li>🌐 Visit electoralsearch.eci.gov.in</li>
<li>📱 Use the <strong>Voter Helpline App</strong></li>
<li>☎️ Call <strong>1950</strong> (free voter helpline)</li>
<li>📋 Check your <strong>Voter Information Slip</strong> — sent before election day</li>
</ul><br>
📌 Booths are usually in nearby schools or government buildings. Can't travel? Ask about <strong>postal ballots</strong>!`,

        `📍 <span class="step-badge">Step 3 — Seen this before? Here's a new way to think about it!</span><br><br>
<strong>Your booth = Your polling address 📬</strong><br><br>
Just like your home address determines which postman delivers your letters, your <em>registered address</em> determines which booth is yours. Change your address? Your booth changes too!<br><br>
<strong>What if I'm far from home on election day?</strong>
<ul>
<li>🏠 <strong>Postal Ballot</strong> — for seniors (85+), persons with disability, essential workers</li>
<li>✉️ Apply at least 5 days before election through the returning officer</li>
<li>📦 Your ballot is posted back to the RO and counted on counting day</li>
</ul><br>
🆕 New in 2023: Home voting available for PwD voters in select constituencies!`
      ],
      intermediate: [
        `📍 <span class="step-badge">Step 3 of 5</span><br><br>
<strong>Locating Your Assigned Polling Booth</strong><br><br>
Polling booths are assigned based on your <em>registered address</em> — divide each area into parts (<em>polling areas</em>), each served by one booth of ~1,000–1,500 voters.<br><br>
<strong>Ways to find your booth:</strong>
<ul>
<li>🌐 EC portal → Voter Search → enter EPIC/name</li>
<li>📱 Voter Helpline App (iOS/Android)</li>
<li>💬 SMS your EPIC number to <strong>1950</strong></li>
<li>📄 Voter Information Slip mailed before each election</li>
</ul>
<strong>Special arrangements:</strong>
<ul>
<li>Postal ballot (80 DA Intimation) — for PwD, seniors 85+, essential service workers</li>
<li>Home voting pilot — select disabilities covered in some states</li>
</ul>`,

        `📍 <span class="step-badge">Step 3 — Behind the scenes</span><br><br>
<strong>How are booths actually organized? 🏫</strong><br><br>
Each constituency is divided into <em>polling segments</em> by the Returning Officer. Every segment is served by one polling station. Booths are gazetted (officially notified) at least 4 weeks before any election.<br><br>
<strong>Booth accessibility rules (EC mandate):</strong>
<ul>
<li>No voter should travel more than 2 km to their booth</li>
<li>Separate queues for women, seniors, and PwD voters mandatory</li>
<li>Wheelchair access, shade, and drinking water must be provided</li>
<li>Creche (childcare) facility is recommended at booths</li>
</ul><br>
📌 If your booth lacks any of these, report to the Booth Level Officer or cVIGIL app!`
      ],
      advanced: [
        `📍 <span class="step-badge">Step 3 of 5</span><br><br>
<strong>Polling Booth Assignment — Legal & Administrative Framework</strong><br><br>
Booths are assigned by the RO under Section 25, RP Act, 1951. Rationalization of polling stations is done periodically — a station may be bifurcated if it exceeds 1,500 electors or merged if below 250.<br><br>
<strong>Accessibility mandates:</strong>
<ul>
<li>Distance: max 2 km per EC Standing Order</li>
<li>PwD ramps, wheelchairs compulsory under Rights of Persons with Disabilities Act, 2016</li>
<li>Shadow booths for inaccessible geographic areas (islands, hills)</li>
</ul>
<strong>Complaints & remedies:</strong> File written grievance with Booth Level Officer → District Election Officer → Returning Officer → EC Observer (deployed 72 hrs before polling).`,

        `📍 <span class="step-badge">Step 3 — Geo-analytics perspective</span><br><br>
<strong>Modern Booth Rationalization</strong><br><br>
The ECI uses GIS (Geographic Information System) mapping since 2015 to rationalize booth locations. Each booth is geo-tagged and reported on the ERONET dashboard accessible to authorized officials.<br><br>
<strong>Booth-related logistics that affect you:</strong>
<ul>
<li>Shadow area booths: Voters in areas unreachable year-round (flood-prone, remote) are brought to a central booth by special transport arranged by DEO</li>
<li>Urban migration: If you've moved within the same constituency, you can get your booth details updated without changing your registration via <strong>Form 8A</strong></li>
</ul><br>
<strong>Legal note:</strong> In <em>K. Krishna Murthy v. Union of India</em> (2010), SC held that EC has an affirmative duty to ensure accessibility for all voters.`
      ]
    }
  },
  {
    id: 'voting-day',
    title: 'Voting Day Process',
    emoji: '🗳️',
    variants: {
      beginner: [
        `🗳️ <span class="step-badge">Step 4 of 5</span><br><br>
<strong>Voting Day — Simpler than it looks! 😊</strong><br><br>
Here's the complete journey from the moment you arrive:<br>
<ul>
<li>1️⃣ Arrive at your booth (usually open 7 AM – 6 PM)</li>
<li>2️⃣ Find your queue (separate lines for women, seniors, PwD)</li>
<li>3️⃣ Show your Voter ID — official finds your name on the list</li>
<li>4️⃣ They put <strong>ink on your left index finger</strong> (proof you voted)</li>
<li>5️⃣ Sign or give your thumb impression in the register</li>
<li>6️⃣ Walk to the <strong>EVM</strong> — press the button for your candidate</li>
<li>7️⃣ Hear the 🔔 beep — vote recorded!</li>
<li>8️⃣ Walk out — done! 🎉</li>
</ul><br>
💡 The whole process takes <strong>under 5 minutes</strong> once you reach the machine.`,

        `🗳️ <span class="step-badge">Step 4 — A fresh story-style walkthrough!</span><br><br>
<strong>Imagine it's Election Morning 🌅</strong><br><br>
You wake up, grab your Voter ID and head to the nearby school (your booth). There's a light queue — you wait maybe 10 minutes. An officer checks your finger for ink (making sure you haven't voted today), then finds your name on the big printed sheet and hands you a slip with a number on it.<br><br>
You walk into a curtained cubicle where the <strong>EVM</strong> sits. It looks like a fat TV remote. You see names and symbols of candidates — and one button each. You press the button next to your choice. A <em>beep</em> confirms it. Done! 🎉<br><br>
Fun fact: The VVPAT machine next to the EVM prints a tiny slip showing <em>which candidate you voted for</em> — it's visible for 7 seconds, then shreds itself securely!`
      ],
      intermediate: [
        `🗳️ <span class="step-badge">Step 4 of 5</span><br><br>
<strong>Voting Day — Complete Process</strong><br><br>
<strong>Before you leave home:</strong>
<ul>
<li>✅ Carry Voter ID + voter slip</li>
<li>✅ Note booth timing (usually 7 AM – 6 PM)</li>
<li>✅ You're entitled to a paid holiday on election day — legal right!</li>
</ul>
<strong>At the booth — 4 stages:</strong>
<ul>
<li>🔹 <strong>Stage 1:</strong> Ink check on left index finger</li>
<li>🔹 <strong>Stage 2:</strong> Identity verification + register sign</li>
<li>🔹 <strong>Stage 3:</strong> Ballot number issued</li>
<li>🔹 <strong>Stage 4:</strong> Vote on EVM; observe VVPAT slip</li>
</ul>
📌 VVPAT (Voter Verified Paper Audit Trail) — slip is visible 7 seconds, stored securely. This is your visual confirmation the EVM recorded your choice correctly.`,

        `🗳️ <span class="step-badge">Step 4 — The EVM in detail</span><br><br>
<strong>How Does the EVM Actually Work?</strong><br><br>
The EVM is two units connected by a cable: the <strong>Control Unit</strong> (with the officer) and the <strong>Ballot Unit</strong> (with you). When the officer enables the ballot, you get 90 seconds to press your choice. Here's the internal flow:<br>
<ul>
<li>📳 You press a candidate button on the Ballot Unit</li>
<li>🔵 The Control Unit records the vote number cryptographically</li>
<li>🖨 The VVPAT simultaneously prints a slip showing your candidate's name and symbol</li>
<li>🗑 The slip drops into a sealed VVPAT box after 7 seconds</li>
</ul>
<strong>NOTA option:</strong> If you don't want to vote for any candidate, press <em>NOTA</em> (None of The Above) — it's the last button on the Ballot Unit.`
      ],
      advanced: [
        `🗳️ <span class="step-badge">Step 4 of 5</span><br><br>
<strong>Voting Day — Legal & Technical Framework</strong><br><br>
Polling procedures are governed by the Conduct of Elections Rules, 1961 (Rules 27–49O). Presiding Officers derive authority from Section 26 of the RP Act, 1951.<br><br>
<strong>EVM + VVPAT system:</strong> EVMs are standalone single-purpose devices (no OS, no WiFi). VVPAT was mandated by Supreme Court in <em>Subramanian Swamy v. ECI</em> (2013). VVPAT cross-verification (5 random booths per constituency) was enhanced to all booths' paper trails for exit scrutiny per SC direction in 2019.<br><br>
<strong>Voter rights at the booth:</strong>
<ul>
<li>Secrecy of vote — Rule 49M, CER 1961</li>
<li>NOTA — introduced via SC direction in <em>PUCL v. UoI</em> (2013)</li>
<li>Tendered ballot — Rule 49P if impersonation suspected</li>
<li>Demand for re-voting if EVM fails — RO may defer polling if not resolved within 4 hours</li>
</ul>`,

        `🗳️ <span class="step-badge">Step 4 — Technical security of EVMs</span><br><br>
<strong>Can EVMs really not be tampered with?</strong><br><br>
The SC has ordered mock polls, random selection of EVMs, and first-level checking by EC engineers before each election. Key technical safeguards:<br>
<ul>
<li><strong>One-time programmable (OTP) microcontroller</strong> — firmware is burned in at manufacture; cannot be updated or overwritten in the field</li>
<li><strong>No external interface</strong> — no USB port, no Bluetooth, no WiFi receiver (verified by independent audit)</li>
<li><strong>Time-stamped cryptographic log</strong> — every button press is logged with timestamp inside the Control Unit's sealed memory</li>
<li><strong>Unique 19-digit encrypted sequence</strong> — each EVM has a unique identifier verified by RO and party agents through sealing protocols</li>
</ul>
In <em>N. Chandrababu Naidu v. Union of India</em> (2019), SC dismissed blanket VVPAT count petitions, but affirmed the existing statistical sampling is sufficient for integrity assurance.`
      ]
    }
  },
  {
    id: 'after-voting',
    title: 'After Voting',
    emoji: '✅',
    variants: {
      beginner: [
        `✅ <span class="step-badge">Step 5 of 5 — Final Step! 🎊</span><br><br>
<strong>After Voting — What Happens Next?</strong><br><br>
<ul>
<li>💜 The ink on your finger stays for <strong>1–2 weeks</strong> (it's indelible — can't be washed off)</li>
<li>🤫 <strong>Your vote is completely secret.</strong> You never have to tell anyone who you voted for</li>
<li>📺 Results are usually announced a few days after polling day</li>
</ul>
<strong>When do results come?</strong><br>
Counting day is announced beforehand. Officials count votes at designated centers — parties send their own agents to watch. And one vote truly can make a difference — some elections are won by <em>100–200 votes</em>!<br><br>
🌟 Well done for learning the whole process — you're now a confident voter!`,

        `✅ <span class="step-badge">Step 5 — A different take!</span><br><br>
<strong>After Voting — You've Just Done Something Big! 🏆</strong><br><br>
Think of it like scoring in a team sport. You've contributed your point — now the whole team's points get counted together to see who wins.<br><br>
<strong>The counting process in simple steps:</strong>
<ul>
<li>🔐 EVMs are sealed and stored in secured strongrooms with police guard</li>
<li>📅 On counting day, strongrooms are opened in front of all party agents and observers</li>
<li>🔢 Results are announced round by round, candidate by candidate</li>
<li>🏅 The candidate with the most votes wins!</li>
</ul><br>
Fun fact: India declares results for millions of votes in just <em>one day</em>! That's the power of electronic voting.`
      ],
      intermediate: [
        `✅ <span class="step-badge">Step 5 of 5</span><br><br>
<strong>After Voting — Rights & What Happens</strong><br><br>
<strong>Your post-vote rights:</strong>
<ul>
<li>🔒 Complete privacy — no one can force you to disclose your vote</li>
<li>💼 Right to return to work after voting (no loss of pay)</li>
<li>🚫 Protection from harassment based on voting choice</li>
</ul>
<strong>Counting process:</strong>
<ul>
<li>EVMs stored in EC strongrooms under 24/7 guard and CCTV</li>
<li>Counting agents from each party/candidate can observe counting</li>
<li>Votes counted round by round; RO announces cumulative totals</li>
<li>Recount can be demanded within the counting session</li>
</ul>
📌 If you suspect fraud, file a complaint with EC within the window specified by local law.`,

        `✅ <span class="step-badge">Step 5 — Focus on your rights</span><br><br>
<strong>Post-Election Rights Most People Don't Know</strong><br><br>
<ul>
<li>📜 <strong>Right to know results in real-time</strong> — EC publishes live round-by-round data on results.eci.gov.in</li>
<li>🗣 <strong>Right to speak about your vote choice</strong> — but you can also legally refuse — no one can compel disclosure</li>
<li>⚖️ <strong>Right to contest election results</strong> — any voter or candidate can file an <em>Election Petition</em> in the High Court within 45 days of declaration</li>
</ul><br>
<strong>Grounds for election petition:</strong>
<ul>
<li>Corrupt practices (bribery, undue influence)</li>
<li>Non-compliance with electoral rules</li>
<li>Disqualification of returned candidate</li>
</ul>`
      ],
      advanced: [
        `✅ <span class="step-badge">Step 5 of 5</span><br><br>
<strong>Post-Poll Rights & Legal Remedies</strong><br><br>
<strong>Secrecy:</strong> Section 128, RP Act 1951 — any disclosure under coercion is not legally binding and can be challenged as obtained under duress.<br><br>
<strong>Counting safeguards:</strong>
<ul>
<li>Counting agents (Rule 53, CER 1961) may note discrepancies and demand recount</li>
<li>RO has powers to order recount under Rule 63</li>
<li>High Court can order recount via election petition under Section 86, RP Act</li>
</ul>
<strong>Election petition (Section 80–81, RP Act):</strong>
<ul>
<li>Filed within 45 days of result declaration</li>
<li>Grounds: corrupt practices, impersonation at scale, bribery, result materially affected by irregularities</li>
<li>HC can declare election void or declare petitioner elected</li>
</ul>`,

        `✅ <span class="step-badge">Step 5 — Strongroom & counting tech</span><br><br>
<strong>EVM Custody & Counting — Technical Deep-dive</strong><br><br>
Post-poll, EVMs are transported in sealed polypropylene carry cases to strongrooms. The strongroom is sealed, CCTV-monitored, and guarded with multi-layer security (paramilitary + local police).<br><br>
<strong>On counting day:</strong>
<ul>
<li>Each EVM's unique ID is matched to its documented seal before opening</li>
<li>Counting is done in 14-round tables; each table has an assistant RO, counting staff, and one counting agent per candidate</li>
<li>The Control Unit's result button displays the tally; it is physically displayed and announced</li>
<li>VVPAT slips are cross-counted for randomly selected EVMs (100% in SC-mandated cases)</li>
</ul>
<strong>Postal ballot counting:</strong> Done before EVM counting, under Rule 54A. Each envelope is validated for correct postmark and counter-signature before opening.`
      ]
    }
  }
];

// ─── Myth database (expanded) ──────────────────
const MYTHS = {
  ink: {
    claim: "You can wash off the indelible ink and vote twice.",
    score: 'myth',
    variants: [
      `<strong>❌ Total Myth!</strong><br><br>
That ink is called <em>indelible ink</em> — it contains Silver Nitrate, which bonds chemically with the protein layer of your skin cells. It doesn't sit on your skin — it becomes part of it for 1–2 weeks!<br><br>
🔬 Fun science fact: The darker the skin, the harder it is to see the mark — but it's always there. Even bleach won't remove it.<br><br>
Plus, officials check your finger <em>before</em> you even enter the booth. Caught trying? That's a criminal offense under Section 171F of the IPC.`,

      `<strong>❌ Still a Myth — here's a different angle!</strong><br><br>
Think of the ink like a <em>tattoo</em> — except one that fades in 2 weeks. It's not just on the surface; it's absorbed into the subdermal layer using Silver Nitrate + UV exposure.<br><br>
Here's another layer: even if you somehow faded it, <strong>three separate officials</strong> check your name, ID, and register during the voting process. There's no single point of failure — it's a system, not just ink.<br><br>
🚨 Attempting to vote twice = 1 year imprisonment under Section 171D, IPC.`
    ]
  },
  evm: {
    claim: "EVMs can be hacked remotely to change votes.",
    score: 'myth',
    variants: [
      `<strong>❌ Total Myth!</strong><br><br>
EVMs are <em>air-gapped, standalone devices.</em> There's no WiFi, no Bluetooth, no SIM card, no USB port — the hardware physically doesn't have these components. You can't hack what has no connection!<br><br>
The microcontroller firmware is burned in at the factory and cannot be updated in the field — not by anyone. The Supreme Court has confirmed EVM integrity through independent audits multiple times.`,

      `<strong>❌ Myth — and here's what "hacking" would actually require</strong><br><br>
To "hack" an EVM you'd need to: physically open it (sealed with tamper-evident seals verified by all party agents) → replace firmware (impossible — One Time Programmable chip) → have access during the 72-hour pre-polling period (guarded by paramilitary troops).<br><br>
In <em>Subramanian Swamy v. ECI</em> (2013), the SC reviewed technical evidence and upheld EVM validity. 15+ expert committees globally have reviewed Indian EVMs — none found a remotely exploitable vector.<br><br>
The VVPAT paper trail adds a physical, un-hackable audit layer on top.`
    ]
  },
  proxy: {
    claim: "A family member can vote on your behalf if you're sick.",
    score: 'myth',
    variants: [
      `<strong>❌ Total Myth!</strong><br><br>
Voting is strictly <em>personal</em>. No one — not your spouse, parent, or sibling — can vote on your behalf. This is called proxy voting and it's <strong>illegal in India</strong> for regular citizens.<br><br>
The exception: Defense service personnel stationed away from home can designate a proxy — but only another defense person with a prescribed form (Form 13F).<br><br>
If you genuinely can't make it to the booth due to disability or age (85+), apply for a <strong>Postal Ballot</strong> before the election — that's the legal alternative!`,

      `<strong>❌ Same answer, fresher framing!</strong><br><br>
Think about it this way: your vote represents <em>your</em> democratic opinion. If someone could vote in your place, they'd be expressing their opinion in your name — which is fundamentally fraudulent.<br><br>
The law treats it that way too: impersonating a voter at the booth is a cognizable offense (Section 171D, IPC). The person who goes instead of you can face up to 1 year imprisonment.<br><br>
🏠 <strong>Can't travel?</strong> Here's what's actually legal:<br>
<ul>
<li>PwD and seniors (80+) → apply for <strong>Home Voting</strong> with Form 12D</li>
<li>Essential workers → Postal Ballot (Form 12)</li>
<li>Ill at home → contact the Presiding Officer for disability assistance</li>
</ul>`
    ]
  },
  nota: {
    claim: "If NOTA gets the most votes, there's a re-election.",
    score: 'myth',
    variants: [
      `<strong>❌ Total Myth!</strong><br><br>
NOTA (None of the Above) does <em>not</em> trigger a re-election even if it "wins." The candidate with the highest number of votes among actual candidates wins — NOTA votes are counted and published, but they <strong>have no legal effect on the result.</strong><br><br>
In fact, the Supreme Court in <em>PUCL v. Union of India</em> (2013) — the case that introduced NOTA — specifically did not confer any binding outcome on NOTA votes. It serves as a tool for voter expression and social pressure, not as a result-changing mechanism.`,

      `<strong>❌ Myth — Here's the actual legal status of NOTA</strong><br><br>
NOTA was introduced following the SC's PUCL judgment in 2013 to give voters a <em>formal channel</em> to express dissatisfaction without voiding their ballot (previously, pressing the cancel button spoiled the vote).<br><br>
But NOTA is not "none selected wins" — it's more like writing "none of the above" in a MCQ exam. The examiner still picks the highest scorer from the actual options.<br><br>
📌 Some state election commissions (like Maharashtra SEC in 2021) have experimented with giving NOTA a "winner effect" in local bodies — but this has not been adopted at the national level and is legally contested.`
    ]
  },
  evm_paper: {
    claim: "Paper ballots are more trustworthy than EVMs.",
    score: 'partial',
    variants: [
      `<strong>⚠️ Partially True — depends on context.</strong><br><br>
Paper ballots are transparent in one way: you can physically recount them. But they come with serious risks — ballot stuffing, booth capturing, burning ballot boxes — these were rampant in Indian elections before EVMs.<br><br>
EVMs eliminated most of those physical frauds. The VVPAT paper trail now gives you a <em>hybrid</em>: electronic speed + a physical paper record for audit.<br><br>
📌 Many democracies use paper (US, UK, Germany) — others use EVMs (India, Brazil, Japan). Both systems require trust-building. India's EVM model has been endorsed by IFES and international election observers.`,

      `<strong>⚠️ Partial — A nuanced truth</strong><br><br>
Both paper and EVM systems have trade-offs:<br>
<ul>
<li><strong>Paper pros:</strong> Physical, human-countable, auditable</li>
<li><strong>Paper cons:</strong> Ballot stuffing, spoilage, slow counting, human error</li>
<li><strong>EVM pros:</strong> Instant, tamper-resistant, eliminates invalid votes, faster results</li>
<li><strong>EVM cons:</strong> Requires public trust in tech, complex to audit without VVPAT</li>
</ul>
The VVPAT was introduced specifically to bridge this gap — giving the voter visible confirmation (paper) of what the EVM recorded (electronic). In statistical sampling audits, no discrepancy has ever been confirmed between EVM + VVPAT counts at scale.`
    ]
  }
};

// ─── Help Scenarios ────────────────────────────
const HELP_SCENARIOS = {
  impersonation: {
    q: 'Someone already voted in my name',
    variants: [
      `<strong>Don't panic — this is serious but completely manageable. 🛡️</strong><br><br>
<strong>What happened?</strong> Someone impersonated you before you arrived. Here's your exact action plan:<br>
<ul>
<li>1️⃣ Stay calm. Walk to the <strong>Presiding Officer</strong> directly</li>
<li>2️⃣ Show your Voter ID and say "someone has voted in my name"</li>
<li>3️⃣ Request a <strong>Tendered Ballot (Rule 49P)</strong> — this is your legal right</li>
<li>4️⃣ File a written complaint with the <strong>Returning Officer</strong></li>
<li>5️⃣ Dial Voter Helpline: <strong>1950</strong> or file on <strong>cVIGIL app</strong></li>
</ul>
<div class="script-box">
  <span class="script-box-label">👉 Say exactly this:</span>
  "Sir/Madam, I believe my vote has already been cast by someone else. I request a Tendered Ballot under Rule 49P of the Conduct of Election Rules. Please record my complaint in writing."
</div><br>
Your tendered ballot is legal evidence. If the original is found fraudulent, <em>your</em> ballot replaces it.`,

      `<strong>Second occurrence? Here's a deeper look at your options 🔍</strong><br><br>
Beyond requesting a Tendered Ballot at the booth, you have <em>post-event legal remedies</em> too:<br>
<ul>
<li>📝 File a First Information Report (FIR) at local police: Section 171D, IPC (impersonation) — cognizable, non-bailable offense</li>
<li>📬 Write to the District Election Officer (DEO) with your voter ID and booth details</li>
<li>🌐 File on the EC's National Grievance Portal: <strong>www.nvsp.in</strong></li>
</ul>
<div class="script-box">
  <span class="script-box-label">👉 For the police complaint, say:</span>
  "I wish to file a complaint under Section 171D of the IPC. Someone impersonated me at Polling Booth [number] in [constituency] on [date] at approximately [time] and cast a fraudulent vote in my name."
</div>`
    ]
  },
  notOnList: {
    q: "My name isn't on the voters list",
    variants: [
      `<strong>Really frustrating — but let's troubleshoot step by step! 🔍</strong><br><br>
<strong>First, double-check these:</strong>
<ul>
<li>✅ Are you at the <em>correct booth</em>? Search at electoralsearch.eci.gov.in</li>
<li>✅ Try a different spelling of your name or father's name</li>
<li>✅ Did you recently move? Your old or new address might still be in the system</li>
</ul>
<strong>If genuinely not on the list:</strong>
<ul>
<li>📋 File Form 6 now — this vote is lost, but the next election requires registration</li>
<li>📞 Call 1950 and log the incident for follow-up</li>
<li>📄 Approach the Booth Level Officer (BLO) on-site with address proof</li>
</ul>
<div class="script-box">
  <span class="script-box-label">👉 Say this at the booth:</span>
  "I am a resident of [address] and I registered to vote. My name does not appear on the list. Can you check using my EPIC number [number]? I'd like to meet the BLO present here."
</div>`,

      `<strong>Still not resolved? Here's what more you can do:</strong><br><br>
If on-site checks don't help:<br>
<ul>
<li>🔍 Check your registration status on <strong>voters.eci.gov.in → Track Application</strong></li>
<li>📞 Ask for the <em>Assistant Returning Officer</em> — they have real-time access to the ERONET database</li>
<li>🗣 Escalate to the Election Observer — their number is posted at the booth and available via 1950</li>
</ul>
<div class="script-box">
  <span class="script-box-label">👉 Say to the ARO:</span>
  "I applied for registration [or was previously registered] at this address. I can show my EPIC card and past voter slip as proof. I request you to verify my entry in ERONET and if there's an error, record it formally so I can cast a vote or get it corrected for future elections."
</div>`
    ]
  },
  coercion: {
    q: "Someone is pressuring me to vote a certain way",
    variants: [
      `<strong>This is voter coercion — completely illegal. You're protected by law. 🚫</strong><br><br>
<strong>Your absolute rights:</strong>
<ul>
<li>🔒 Your vote is <em>100% secret</em> — the EVM records it anonymously; no one can ever know what you pressed</li>
<li>⚖️ Threatening a voter is a criminal offense (Section 171C, IPC — "Undue Influence")</li>
<li>🙅 You are <strong>never legally required</strong> to reveal your vote to anyone</li>
</ul>
<strong>What to do:</strong>
<ul>
<li>📞 Call Police: <strong>100</strong> or Election Helpline: <strong>1950</strong></li>
<li>📱 File on <strong>cVIGIL App</strong> — submit evidence, EC responds within 100 minutes</li>
<li>📝 Note: who, what, where, when</li>
</ul>
<div class="script-box">
  <span class="script-box-label">👉 Say this confidently:</span>
  "My vote is completely secret — no one can ever verify how I voted. What you're doing is undue influence under Section 171C of the IPC. I will be reporting this to the Election Commission immediately."
</div>`,

      `<strong>Being pressured again or by a different party? Same rights apply — stronger enforcement available.</strong><br><br>
The key thing to remember: <em>even if you SAY you'll vote a certain way under pressure, you can vote completely differently</em>. Your vote is anonymous — no one can verify it.<br><br>
<strong>Escalation path:</strong>
<ul>
<li>🎥 cVIGIL App — real-time geo-tagged complaint with photo/video evidence. EC deploys field team within 100 minutes</li>
<li>🏛️ Flying Squad — a mobile EC team that can physically intervene; request through 1950</li>
<li>🚔 MCMC (Media Certification and Monitoring Committee) — for threats via social media/propaganda</li>
</ul>
<div class="script-box">
  <span class="script-box-label">👉 On phone to police:</span>
  "I want to file a complaint of voter coercion at [location]. [Name/description of person] threatened me that [describe threat]. This is a violation of the Model Code of Conduct and Section 171C of the IPC."
</div>`
    ]
  },
  evm_issue: {
    q: "The voting machine is malfunctioning",
    variants: [
      `<strong>Stay calm — this procedure is well-defined! 🔧</strong><br><br>
<ul>
<li>1️⃣ Inform the <strong>Presiding Officer</strong> immediately — they'll call a technical team</li>
<li>2️⃣ If unfixable, a <strong>replacement EVM</strong> must arrive within 4 hours</li>
<li>3️⃣ Wait — all voters who arrived before the breakdown retain their right to vote</li>
<li>4️⃣ If not resolved in time, that booth's poll may be deferred — you'll be notified</li>
</ul>
<div class="script-box">
  <span class="script-box-label">👉 Say to the Presiding Officer:</span>
  "The EVM is not registering any vote / showing error code [describe]. I request you to call the technical team and arrange a replacement as per Conduct of Elections Rules. I will wait to exercise my right to vote."
</div>`,

      `<strong>Specific malfunction troubleshooting — if the PO isn't responding fast enough:</strong><br><br>
<ul>
<li>📞 Call <strong>1950</strong> directly — they have a direct line to the sector magistrate who can order immediate EVM replacement</li>
<li>📱 File on <strong>cVIGIL App</strong> with a photo of the error/stuck machine</li>
<li>🗣 Ask for the booth's Micro Observer if present — they have authority to escalate</li>
</ul>
<div class="script-box">
  <span class="script-box-label">👉 Escalation script:</span>
  "I've reported the EVM malfunction to the Presiding Officer [X] minutes ago and there's been no resolution. I'm exercising my right to report this to the Sector Magistrate and Voter Helpline 1950. I expect a replacement EVM within the mandated timeframe or this to be escalated to the Returning Officer."
</div>`
    ]
  }
};

// ─── Experience Setup ──────────────────────────
function setExperience(level) {
  if (level === null) {
    document.getElementById('experience-selector').classList.remove('hidden');
    return;
  }
  state.level = level;
  document.getElementById('knowledge-check').classList.add('hidden');
  document.getElementById('mode-grid').style.display = 'grid';
}

// ─── Mode Start ────────────────────────────────
function startMode(mode) {
  state.mode = mode;
  state.step = 0;
  state.confusionCount = 0;
  if (mode !== state.mode) state.msgCount = 0; // reset only on mode change

  document.getElementById('welcome-screen').classList.add('hidden');
  document.getElementById('chat-container').classList.remove('hidden');
  document.getElementById('messages-area').innerHTML = '';
  document.getElementById('quick-chips').innerHTML = '';

  const icons  = { learn: '🗺️', mythbust: '🔍', help: '⚖️' };
  const names  = { learn: 'Election Guide', mythbust: 'Myth Buster', help: 'Voter Help' };
  document.getElementById('chat-mode-icon').textContent  = icons[mode];
  document.getElementById('chat-mode-name').textContent  = names[mode];
  updateLevelBadge();

  setTimeout(() => {
    if (mode === 'learn')     openLearnMode();
    else if (mode === 'mythbust') openMythbustMode();
    else if (mode === 'help') openHelpMode();
  }, 300);
}

// ─── Learn Mode ────────────────────────────────
function openLearnMode() {
  const msgs = {
    beginner: `Hey there! 🎉 Welcome to <strong>Election Guide Mode</strong>!<br><br>
I'm going to walk you through the entire voting journey — <em>step by step</em>, super simple. Think of it like the tutorial before the big game! 🎮<br><br>
We've got <strong>5 steps</strong> to cover:<br>
<ul>
<li>📝 Voter Registration</li>
<li>🪪 Voter ID</li>
<li>📍 Finding your booth</li>
<li>🗳️ Voting Day</li>
<li>✅ After Voting</li>
</ul>
Ready to begin with <strong>Step 1</strong>? 😊`,
    intermediate: `Welcome to the <strong>Election Guide</strong>! 📋<br><br>
I'll walk you through all 5 stages of the voting process clearly — from registration to post-poll rights.<br><br>
Shall we begin with <strong>Step 1: Voter Registration</strong>?`,
    advanced: `<strong>Election Process Guide</strong> ⚖️<br><br>
Covering all 5 electoral stages with legal context, statutes, and procedural nuances. Starting with <strong>Step 1: Voter Registration</strong> — shall we?`,
  };
  addAIMessage(msgs[state.level], [
    { label: "Yes, let's go! 🚀", action: () => showStep(0) },
    { label: "Show me all steps first", action: showAllSteps },
  ]);
}

function showAllSteps() {
  let html = `<strong>Your complete voting journey:</strong><br><br>`;
  STEPS.forEach((s, i) => {
    html += `<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;">
      <span style="font-size:1.1rem">${s.emoji}</span>
      <span><strong>Step ${i+1}:</strong> ${s.title}</span>
    </div>`;
  });
  html += `<br>Which step do you want to start from?`;
  addAIMessage(html, STEPS.map((s, i) => ({
    label: `${s.emoji} Step ${i+1}`,
    action: () => showStep(i),
  })));
}

function showStep(index) {
  if (index >= STEPS.length) {
    const finishHtml = buildStructuredResponse({
      intro:    `🎊 <strong>You've completed the full Voting Guide!</strong>`,
      body:     `You now know the full process — from registration to counting day. You're ready to vote confidently and help others too! 💪`,
      followUp: `What's next? Want to bust some myths or get help with a real situation?`,
    });
    addAIMessage(finishHtml, [
      { label: '🔍 Bust some myths', action: () => startMode('mythbust') },
      { label: '⚖️ Get voting help', action: () => startMode('help') },
      { label: '🏠 Go home', action: goHome },
    ]);
    return;
  }

  state.step = index;
  const step = STEPS[index];
  const key  = step.id;
  const seen = getSeenCount(key);

  // Pick a style different from the last explanation (anti-repetition)
  const style = pickStyle(state.ctx.previous_style);

  // Pick variant: 0 = first time, 1 = repeated (or beyond)
  const variantIdx = Math.min(seen, step.variants[state.level].length - 1);
  const content    = step.variants[state.level][variantIdx];
  markSeen(key);

  // Banner: fresh-take notice or first-time ctx chip
  const topBanner = seen > 0
    ? `<div class="fresh-take-notice">🔄 Seen before — fresh perspective using a <strong>${style}</strong> approach!</div>`
    : `<div class="ctx-chip">📖 Style: <strong>${style}</strong> · Level: <strong>${state.level}</strong></div>`;

  // Progress dots
  let dotsHTML = `<div class="steps-progress">`;
  STEPS.forEach((_, i) => {
    dotsHTML += `<div class="step-dot ${i < index ? 'done' : i === index ? 'active' : ''}"></div>`;
  });
  dotsHTML += `</div>`;

  const html = buildStructuredResponse({
    intro:    dotsHTML,              // progress bar lives in the intro slot
    body:     topBanner + content,
    followUp: index < STEPS.length - 1
      ? `Ready for <strong>${STEPS[index+1].title}</strong>? Or do you have a question about this step?`
      : `That's the last step! Want to test your knowledge with the Myth Buster?`,
  });

  // Record what we just explained for next-round anti-repetition
  updateCtxAfterResponse(`step:${key}`, style);

  addAIMessage(html, [
    ...(index < STEPS.length - 1 ? [
      { label: `Next: ${STEPS[index+1].emoji} ${STEPS[index+1].title} →`, action: () => showStep(index + 1) },
    ] : [
      { label: '🎉 Finish Guide!', action: () => showStep(STEPS.length) },
    ]),
    ...(index > 0 ? [{ label: '← Previous', action: () => showStep(index - 1) }] : []),
    { label: '🤔 I have a question', action: null },
  ]);
}


// ─── Myth Buster Mode ─────────────────────────
function openMythbustMode() {
  const alreadyUsed = Object.keys(state.seenMyths).length > 0;
  const intro = alreadyUsed
    ? `🔍 Back for more myth-busting! Great — let's check another claim. What have you heard? 👇`
    : `👋 Welcome to <strong>Myth Buster Mode</strong> — your personal Truth Detective! 🔍<br><br>
How it works:<br>
<ul>
<li>Share a claim, rumor, or WhatsApp message you've seen</li>
<li>I'll give it a <strong>Truth Score</strong>: ✅ Solid Fact | ⚠️ Partially True | ❌ Total Myth</li>
<li>Then explain <em>why</em> — clearly and simply</li>
</ul>
Let's check something together! 👇`;

  addAIMessage(intro, [
    { label: '"Ink washes off — vote twice"', action: () => checkMyth('ink') },
    { label: '"EVMs can be hacked"', action: () => checkMyth('evm') },
    { label: '"Family can vote for me"', action: () => checkMyth('proxy') },
    { label: '"NOTA win = re-election"', action: () => checkMyth('nota') },
    { label: '📋 Paper > EVMs?', action: () => checkMyth('evm_paper') },
    { label: '🤔 Type my own claim', action: null },
  ]);
}

function checkMyth(key) {
  const myth = MYTHS[key];
  addUserMessage(`"${myth.claim}"`);
  setTimeout(() => bustMyth(key), 600);
}

function bustMyth(key) {
  const myth = MYTHS[key];
  const seen = state.seenMyths[key] || 0;
  state.seenMyths[key] = seen + 1;

  // Pick a style different from last time
  const style = pickStyle(state.ctx.previous_style);

  const variantIdx = Math.min(seen, myth.variants.length - 1);
  const explanation = myth.variants[variantIdx];

  const scoreMap = {
    fact:    `<div class="truth-score score-fact">✅ Solid Fact</div>`,
    partial: `<div class="truth-score score-partial">⚠️ Partially True</div>`,
    myth:    `<div class="truth-score score-myth">❌ Total Myth</div>`,
  };

  const repeatBanner = seen > 0
    ? `<div class="myth-deep-notice">🔄 Seen this before — fresh take using a <strong>${style}</strong> approach!</div>`
    : `<div class="ctx-chip">🔍 Style: <strong>${style}</strong> · Level: <strong>${state.level}</strong></div>`;

  const body = `
${repeatBanner}
<strong>📌 The Claim:</strong><br>
<em>"${myth.claim}"</em><br><br>
<strong>🏷️ Truth Score:</strong><br>
${scoreMap[myth.score]}<br><br>
${explanation}`;

  const html = buildStructuredResponse({
    intro:    `Okay, let's inspect this claim 🔬`,
    body,
    followUp: `Want to check another claim, or would you like to know what to do if you actually encounter this situation?`,
  });

  // Record context for next response
  updateCtxAfterResponse(`myth:${key}`, style);

  addAIMessage(html, [
    { label: '🔍 Check another myth', action: openMythbustMode },
    { label: '⚖️ Get voting help', action: () => startMode('help') },
    { label: '🗺️ Learn voting steps', action: () => startMode('learn') },
  ]);
}

function handleCustomClaim(text) {
  const lower = text.toLowerCase();
  if (lower.includes('ink') || lower.includes('wash') || lower.includes('finger')) {
    bustMyth('ink');
  } else if (lower.includes('evm') || lower.includes('hack') || lower.includes('tamper') || lower.includes('machine') || lower.includes('rig')) {
    bustMyth('evm');
  } else if (lower.includes('proxy') || lower.includes('behalf') || lower.includes('sick') || lower.includes('family') || lower.includes('someone vote for')) {
    bustMyth('proxy');
  } else if (lower.includes('nota') || lower.includes('none of the above') || lower.includes('re-election') || lower.includes('re election')) {
    bustMyth('nota');
  } else if (lower.includes('paper') || lower.includes('paper ballot') || lower.includes('more trustworthy')) {
    bustMyth('evm_paper');
  } else {
    // Unknown claim
    const html = `Let me run that through my fact-check engine 🔎<br><br>
<strong>📌 The Claim:</strong><br>
<em>"${escapeHTML(text)}"</em><br><br>
<strong>🔎 Analysis:</strong><br>
This specific claim isn't in my verified database yet. Here's how to verify it yourself:<br>
<ul>
<li>🌐 Your country's official Election Commission website</li>
<li>📞 Election Helpline: <strong>1950</strong> (India) — staffed with trained officials</li>
<li>📰 Reputed fact-checkers: <strong>Alt News</strong>, <strong>BOOM Live</strong>, <strong>Factly</strong></li>
</ul><br>
<div class="truth-score score-partial">⚠️ Unverified — please cross-check</div><br>
<strong>💡 Golden rule:</strong> If a message says "Forward to everyone!" or creates urgency — treat it with extra suspicion. Misinformation spreads fastest when it hijacks fear or excitement.`;

    addAIMessage(html, [
      { label: '🔍 Check a known myth', action: openMythbustMode },
      { label: '⚖️ Get voting help', action: () => startMode('help') },
    ]);
  }
}

// ─── Help Mode ─────────────────────────────────
function openHelpMode() {
  const returning = (state.seenTopics['help_opened'] || 0) > 0;
  markSeen('help_opened');

  const msg = returning
    ? `Back with another issue? I've got you. What's happening now?`
    : `Hey! 👋 I'm here to help with <em>real situations</em> at or around the polling booth.<br><br>Tell me what happened — or pick a scenario below:`;

  addAIMessage(msg, [
    { label: '😰 Someone voted in my name', action: () => showHelp('impersonation') },
    { label: '😕 My name isn\'t on the list', action: () => showHelp('notOnList') },
    { label: '😠 Being pressured to vote', action: () => showHelp('coercion') },
    { label: '⚠️ Voting machine broken', action: () => showHelp('evm_issue') },
    { label: '💬 Something else...', action: null },
  ]);
}

function showHelp(key) {
  const scenario = HELP_SCENARIOS[key];
  const seen     = state.seenTopics['help_' + key] || 0;
  state.seenTopics['help_' + key] = seen + 1;

  addUserMessage(scenario.q);

  const style = pickStyle(state.ctx.previous_style);
  const variantIdx = Math.min(seen, scenario.variants.length - 1);
  const answerBody = scenario.variants[variantIdx];

  const deepBanner = seen > 0
    ? `<div class="help-deep-notice">🔄 Going deeper this time — escalation guidance + stronger scripts.</div>`
    : `<div class="ctx-chip">⚖️ Style: <strong>${style}</strong> · Level: <strong>${state.level}</strong></div>`;

  const html = buildStructuredResponse({
    intro:    null,   // embedded in answerBody already
    body:     deepBanner + answerBody,
    followUp: `Did this help? If the problem is still unresolved, I can escalate the guidance further or switch modes.`,
  });

  updateCtxAfterResponse(`help:${key}`, style);

  setTimeout(() => {
    addAIMessage(html, [
      { label: '🆘 Another problem', action: openHelpMode },
      { label: '🔍 Check a myth', action: () => startMode('mythbust') },
      { label: '🗺️ Learn voting steps', action: () => startMode('learn') },
    ]);
  }, 600);
}

// ─── Confusion Handler ────────────────────────
function handleConfusion() {
  state.confusionCount++;
  const downgraded = autoDowngrade();

  // Always avoid whatever style was used before — use a story/visual for confusion
  const style = (state.ctx.previous_style === 'story') ? 'visual' : 'story';

  const bodyVariants = [
    // First confusion — library card analogy
    `Imagine you moved to a new city and want to borrow books from the library. Before you can borrow anything, they ask you to sign up — verify your name, address, and give you a card. <em>That's registration.</em> Your Voter ID is that card. Voting is walking in, showing the card, and picking your book! 📚`,
    // Second confusion — simplest possible version
    `Okay — let's strip it all the way down. Three things. That's all voting is:<br><br>
📝 <strong>Step 1</strong> = Add your name to a list (registration)<br>
🪪 <strong>Step 2</strong> = Show you're on the list (Voter ID)<br>
🗳️ <strong>Step 3</strong> = Press a button (voting)<br><br>
Which step do you want me to explain first? I'll make it a short story — no jargon!`,
    // Third confusion — pure visual layout
    `Here's the whole thing in pictures:<br><br>
🏠 You → 📋 Registration form → ✅ Name added to list<br>
⬇️<br>
🗓️ Election day arrives<br>
⬇️<br>
🚶 You walk to nearby school/building (your booth)<br>
⬇️<br>
🪪 Show ID → 👆 Ink on finger → 🔘 Press button on machine → 🔔 Beep!<br>
⬇️<br>
🎉 Done — you voted!`,
  ];

  const msgBody = bodyVariants[Math.min(state.confusionCount - 1, bodyVariants.length - 1)];

  const levelNotice = downgraded
    ? `<div class="confusion-notice">💡 Switched to <strong>${state.level}</strong> mode — simpler language from now on.</div>`
    : `<div class="confusion-notice">💡 No problem — let me try a completely different way to explain this.</div>`;

  const html = buildStructuredResponse({
    intro:    `No worries at all! 😊 Let me try a ${style === 'story' ? 'real-life story' : 'visual layout'} instead.`,
    body:     levelNotice + msgBody,
    followUp: `Which part is still unclear? Tell me in your own words and I'll match my explanation exactly to what you need.`,
  });

  updateCtxAfterResponse('confusion-simplify', style);

  addAIMessage(html, [
    { label: '📝 Registration', action: () => showStep(0) },
    { label: '🪪 Voter ID', action: () => showStep(1) },
    { label: '🗳️ Voting Day', action: () => showStep(3) },
    { label: '🔍 Check a myth', action: () => startMode('mythbust') },
  ]);
}

// ─── Message Routing ──────────────────────────
function sendMessage() {
  const input = document.getElementById('user-input');
  const text  = input.value.trim();
  if (!text) return;

  addUserMessage(text);
  input.value = '';
  autoResize(input);
  state.msgCount++;

  // Fill the prompt template from current live state before routing
  const filledPrompt = fillTemplate(text);
  // Store on state for optional debug access
  state._lastFilledPrompt = filledPrompt;

  setTimeout(() => processUserMessage(text), 400);
}

function processUserMessage(text) {
  const lower = text.toLowerCase();

  // ── Confusion check (runs in all modes) ──────
  if (detectConfusion(text)) {
    showTyping();
    setTimeout(() => { hideTyping(); handleConfusion(); }, 900);
    return;
  }

  // ── Global navigation shortcuts ──────────────
  if (lower.includes('go home') || lower === 'home') { goHome(); return; }

  // ── Myth Buster ──────────────────────────────
  if (state.mode === 'mythbust') {
    showTyping();
    setTimeout(() => { hideTyping(); handleCustomClaim(text); }, 1200);
    return;
  }

  // ── Help Mode ────────────────────────────────
  if (state.mode === 'help') {
    showTyping();
    setTimeout(() => {
      hideTyping();
      if (lower.includes('name') || lower.includes('list') || lower.includes('register') || lower.includes('not found')) {
        showHelp('notOnList');
      } else if (lower.includes('voted') || lower.includes('imperson') || lower.includes('already cast')) {
        showHelp('impersonation');
      } else if (lower.includes('pressure') || lower.includes('threat') || lower.includes('force') || lower.includes('coerce') || lower.includes('intimidate')) {
        showHelp('coercion');
      } else if (lower.includes('machine') || lower.includes('evm') || lower.includes('malfunction') || lower.includes('broken') || lower.includes('error')) {
        showHelp('evm_issue');
      } else {
        addAIMessage(`I hear you — let me help! Your situation: <em>"${escapeHTML(text)}"</em><br><br>
Here's general guidance while I narrow it down:<br>
<ul>
<li>📞 Voter Helpline: <strong>1950</strong> for real-time support</li>
<li>📱 <strong>cVIGIL App</strong> — report issues with geo-tagged evidence</li>
<li>🌐 <strong>nvsp.in</strong> — National Voter Service Portal for all formal complaints</li>
</ul><br>
Can you pick the closest match below?`, [
          { label: '😰 Voting fraud', action: () => showHelp('impersonation') },
          { label: '😕 Registration issue', action: () => showHelp('notOnList') },
          { label: '😠 Pressure/threats', action: () => showHelp('coercion') },
          { label: '⚠️ Machine issue', action: () => showHelp('evm_issue') },
        ]);
      }
    }, 1000);
    return;
  }

  // ── Learn Mode ───────────────────────────────
  if (state.mode === 'learn') {
    showTyping();
    setTimeout(() => {
      hideTyping();

      // Upgrade level if user asks for more detail
      if (lower.includes('more detail') || lower.includes('tell me more') || lower.includes('deeper') || lower.includes('legal')) {
        if (state.level === 'beginner') { state.level = 'intermediate'; updateLevelBadge(); }
        else if (state.level === 'intermediate') { state.level = 'advanced'; updateLevelBadge(); }
        const levelUpHtml = buildStructuredResponse({
          intro:    `Got it — levelling up! 📈`,
          body:     `I'll switch to a <strong>${state.level}</strong> explanation from now on — more detail, different angle, no repeated analogies.`,
          followUp: `Here's the same step with fresh depth — does this hit the right level?`,
        });
        addAIMessage(levelUpHtml, []);
        setTimeout(() => showStep(state.step), 700);
        return;
      }

      // Navigation
      if (lower.includes('next') || lower.includes('continue') || lower === 'yes' || lower === 'ok' || lower === 'okay') {
        showStep(state.step + 1);
        return;
      }

      if (lower.includes('previous') || lower.includes('back') || lower.includes('prev')) {
        if (state.step > 0) showStep(state.step - 1);
        return;
      }

      const stepMatch = lower.match(/step\s*(\d)/);
      if (stepMatch) {
        const num = parseInt(stepMatch[1]);
        if (num >= 1 && num <= 5) { showStep(num - 1); return; }
      }

      // Check for myth or help intent during learn mode
      if (lower.includes('myth') || lower.includes('fake') || lower.includes('true') || lower.includes('real')) {
        addAIMessage(`Sounds like you want to fact-check something! 🔍 Let me switch you to <strong>Myth Buster Mode</strong>.`, [
          { label: '🔍 Yes, switch to Myth Buster', action: () => startMode('mythbust') },
          { label: '📚 No, continue the guide', action: () => showStep(state.step) },
        ]);
        return;
      }

      // General question in learn mode
      addAIMessage(`Great question 🤔 Context-specific details vary by state and election type. For the most accurate answer:<br>
<ul>
<li>🌐 <strong>eci.gov.in</strong> — official Election Commission</li>
<li>📞 <strong>1950</strong> — Voter Helpline, 24/7 during elections</li>
</ul><br>
Want to continue with the guide, or jump to a different step?`, [
        { label: 'Continue guide →', action: () => showStep(state.step) },
        { label: '📋 All steps', action: showAllSteps },
        { label: '🏠 Go home', action: goHome },
      ]);
    }, 900);
  }
}

// ─── UI Helpers ───────────────────────────────
function addAIMessage(html, chips = []) {
  const area = document.getElementById('messages-area');
  const msg  = document.createElement('div');
  msg.className = 'msg ai';
  msg.innerHTML = `
    <div class="msg-avatar">🛡️</div>
    <div class="msg-bubble">${html}</div>
  `;
  area.appendChild(msg);
  scrollToBottom();
  setChips(chips);
}

function addUserMessage(text) {
  const area = document.getElementById('messages-area');
  const msg  = document.createElement('div');
  msg.className = 'msg user';
  msg.innerHTML = `
    <div class="msg-avatar">👤</div>
    <div class="msg-bubble">${escapeHTML(text)}</div>
  `;
  area.appendChild(msg);
  scrollToBottom();
  clearChips();
}

function setChips(chips) {
  const container = document.getElementById('quick-chips');
  container.innerHTML = '';
  chips.forEach(chip => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.textContent = chip.label;
    if (chip.action) {
      btn.onclick = () => {
        addUserMessage(chip.label);
        clearChips();
        setTimeout(chip.action, 400);
      };
    } else {
      btn.onclick = () => {
        document.getElementById('user-input').focus();
        clearChips();
      };
    }
    container.appendChild(btn);
  });
}

function clearChips() {
  document.getElementById('quick-chips').innerHTML = '';
}

function showTyping() {
  state.isTyping = true;
  document.getElementById('typing-indicator').classList.remove('hidden');
  scrollToBottom();
}

function hideTyping() {
  state.isTyping = false;
  document.getElementById('typing-indicator').classList.add('hidden');
}

function scrollToBottom() {
  const area = document.getElementById('messages-area');
  setTimeout(() => { area.scrollTop = area.scrollHeight; }, 60);
}

function escapeHTML(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 150) + 'px';
}

function handleInputKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

// ─── Navigation ────────────────────────────────
function goHome() {
  document.getElementById('chat-container').classList.add('hidden');
  document.getElementById('welcome-screen').classList.remove('hidden');
  state.mode = null;
  state.step = 0;
  state.confusionCount = 0;
}

// ─── Init ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('mode-grid').style.display = 'none';
});
