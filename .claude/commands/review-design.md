You are a senior UI/UX designer and frontend engineer specializing in dark-themed web applications. Your task is to perform a thorough design review of this Flask PDF merger project and provide actionable recommendations.

## Step 1 — Read All Project Files

Read the following files in full before writing any analysis:

- `templates/base.html`
- `templates/index.html`
- `static/css/style.css`
- `static/js/main.js`

## Step 2 — Analyze These Areas

### 🎨 Visual Design
- CSS custom property (variable) system — consistency and completeness
- Color palette: contrast ratios, accessibility (WCAG AA at minimum)
- Typography: font sizes, weights, line heights, hierarchy
- Spacing system: consistency of padding/margin/gap values
- Shadows, borders, border-radius — consistent design language
- Gradient usage — overused, underused, or inconsistent?
- Dark theme quality — does it feel polished or flat?

### 🧭 UX Flow & Usability
- End-to-end user journey: land → upload → select pages → merge → download
- Clarity of primary CTAs at each step
- Are empty states handled gracefully?
- Is error feedback clear and actionable?
- Loading states — does the user always know what's happening?
- Workflow step indicator — is it clear which step the user is on?

### 🧩 Component Design
- Navbar: hierarchy, active states, mobile collapse behavior
- Drop zone: affordances, drag-over feedback, visual clarity
- PDF selector cards: information density, readability, actions
- Page thumbnail grid: sizing, spacing, selection states
- Preview modal: layout, navigation, usability
- Sticky merge bar: visibility, contrast, legibility
- Feature cards / step cards (hero sections): hover states, visual weight

### ♿ Accessibility
- Color contrast (text on background, interactive elements)
- Semantic HTML structure (headings, landmarks, lists)
- Keyboard navigability (tab order, focus rings)
- Screen reader support (ARIA labels, roles, live regions)
- Touch targets — are interactive elements large enough on mobile?
- `title` attributes on icon-only buttons

### 📱 Responsive Design
- Breakpoint coverage — are all layouts tested?
- Mobile navigation behavior
- Thumbnail grid on small screens
- Merge bar on mobile (sticky vs static)
- Modal on small screens
- Typography scaling

### ⚡ Performance & Code Quality
- CSS: specificity issues, redundant rules, missing `will-change` for animated elements
- CSS: any properties that trigger layout/paint unnecessarily
- JS: are there memory concerns (pdfDocs stored, canvas elements, event listeners)?
- JS: is PDF.js being used efficiently (page rendering, viewport scale)?
- Render-blocking assets or missing async loading

## Step 3 — Output Format

Structure your response exactly like this:

---

## Design Review — PDF Merger Project

### ✅ Strengths
List 4–6 things that are done particularly well with brief explanations.

---

### 🔍 Findings

For each area (Visual Design, UX Flow, Components, Accessibility, Responsive, Performance) provide:

**[Area Name]**
| Severity | Finding | Recommendation |
|----------|---------|----------------|
| 🔴 Critical | description | fix |
| 🟠 High | description | fix |
| 🟡 Medium | description | fix |
| 🟢 Low | description | fix |

Include code snippets (CSS or HTML or JS) for the most impactful recommendations.

---

### 🚀 Priority Action List

Rank the **top 6 most impactful changes** the developer should make, ordered by impact. For each:
1. **What**: one sentence description
2. **Why**: user impact or technical reason
3. **How**: concrete implementation hint or code snippet

---

### 📊 Design Score

Rate each area out of 10 and give an overall score:
| Area | Score | Notes |
|------|-------|-------|
| Visual Design | /10 | |
| UX Flow | /10 | |
| Components | /10 | |
| Accessibility | /10 | |
| Responsiveness | /10 | |
| Code Quality | /10 | |
| **Overall** | **/10** | |

Keep recommendations specific, referencing actual CSS class names, HTML IDs, or JS function names from the codebase. Avoid generic advice — every recommendation should be directly actionable in this project.
