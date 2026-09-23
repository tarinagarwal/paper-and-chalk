/**
 * Home page copy. Every claim here maps to a feature in SPEC.md; nothing is invented
 * (no customers, testimonials or usage numbers).
 */

export const docTypes = [
  {
    id: "notebook",
    name: "Notebook",
    body: "Fixed pages from A6 to A0, on ruled, grid, dot or 15 other kinds of paper.",
  },
  {
    id: "pdf",
    name: "PDF",
    body: "Import any PDF and write on top. The original file is never changed.",
  },
  {
    id: "canvas",
    name: "Infinite canvas",
    body: "A board with no edges. Frames turn any region into a page.",
  },
  {
    id: "hybrid",
    name: "Hybrid",
    body: "Mix PDF pages, paper pages and canvas pages in one document.",
  },
] as const;

export type DocTypeId = (typeof docTypes)[number]["id"];

export interface Feature {
  id: string;
  number: string;
  label: string;
  title: string;
  body: string;
  points: readonly string[];
}

/** The five big alternating sections. */
export const primaryFeatures: readonly Feature[] = [
  {
    id: "pdf",
    number: "01",
    label: "PDF markup",
    title: "Mark up PDFs as if they were paper.",
    body: "Highlights snap to the words underneath, so they stay attached to the text, not to pixels. Everything you add stays editable, and the file you imported is never touched.",
    points: [
      "Highlight, underline, strike and squiggle bound to real text",
      "Fill forms, sign, or send a document for signatures in order",
      "Redaction that removes the text, not a black box on top",
      "Export flattened, or as annotations Acrobat and Preview can edit",
      "Insert blank or grid pages between any two PDF pages",
    ],
  },
  {
    id: "notebooks",
    number: "02",
    label: "Notebooks",
    title: "Notebooks with real paper.",
    body: "Pick a size, pick a paper, start writing. Switch ruled to grid later without touching a stroke, and mix page sizes in one notebook.",
    points: [
      "18 templates, from college ruled to Cornell, music staff and isometric",
      "ISO A, B and C sizes, US Letter, Legal, slides, index cards, or custom",
      "Paper colour, line colour, spacing and margins, with a dark paper option",
      "Writing near the bottom of the last page adds the next one",
    ],
  },
  {
    id: "ink",
    number: "03",
    label: "Ink",
    title: "Ink that keeps up with your hand.",
    body: "Pressure and tilt from your stylus, drawn under 16 milliseconds after the pen touches down. Every stroke stays a vector you can select, recolour and move, forever.",
    points: [
      "Seven pens: ballpoint, fountain, brush, pencil, marker, calligraphy, highlighter",
      "Palm rejection, and a stylus-only mode that leaves touch for panning",
      "Hold at the end of a stroke to straighten it, or to snap it into a shape",
      "Scribble to erase, or erase only your own strokes on a shared page",
    ],
  },
  {
    id: "canvas",
    number: "04",
    label: "Infinite canvas",
    title: "A board big enough for the whole system.",
    body: "Diagram an architecture, run a retro or map a lecture on a canvas with no edges. Connectors stay attached when shapes move, and frames become pages you can export or present.",
    points: [
      "Shapes, sticky notes, tables, code blocks, LaTeX and embeds",
      "Connectors with elbow routing that steers around shapes",
      "Mind map mode: Tab adds a child, Enter adds a sibling",
      "Paste Mermaid code and get shapes you can edit",
      "Templates for kanban, retros, SWOT, user journeys and system design",
    ],
  },
  {
    id: "collaboration",
    number: "05",
    label: "Realtime",
    title: "Draw together, even on a PDF.",
    body: "See each other's cursors and strokes while they're being drawn, not after. Every change lands on your device first, so you keep working offline and everything merges when you reconnect.",
    points: [
      "Live cursors, live strokes and follow mode",
      "Comments on a word, an area or a shape, with @mentions",
      "Roles, locked pages and layers only the owner can edit",
      "Offline edits merge on reconnect with no conflict prompts",
      "Built-in voice chat for study groups",
    ],
  },
];

/** The four smaller cards. */
export const secondaryFeatures: readonly Feature[] = [
  {
    id: "audio",
    number: "06",
    label: "Audio",
    title: "Replay the lecture, stroke by stroke.",
    body: "Record while you write. Tap any word on the page to hear what was being said as you wrote it, or play the page back in the order it was written.",
    points: ["Searchable transcripts", "Several recordings per document"],
  },
  {
    id: "ai",
    number: "07",
    label: "AI",
    title: "AI that reads your handwriting.",
    body: "Turn handwriting into text and maths into LaTeX, or ask a 300-page PDF a question and get an answer that links to the page. Nothing changes until you choose Insert.",
    points: ["Summaries with page citations", "Flashcards and quizzes from your notes"],
  },
  {
    id: "study",
    number: "08",
    label: "Study",
    title: "Revise with what you already wrote.",
    body: "Cover answers with tape and tap to reveal. Turn any selection into a flashcard and review it on a spaced-repetition schedule.",
    points: ["Daily review queue", "Focus timer and study stats"],
  },
  {
    id: "present",
    number: "09",
    label: "Present & export",
    title: "Present it, then send it anywhere.",
    body: "Pages and frames become slides, with a laser pointer and ink that clears on the next slide. Export to whatever the next person needs.",
    points: ["PDF, PNG, SVG, Markdown, DOCX", "Save to disk, Drive, Dropbox, OneDrive"],
  },
];

export const principles = [
  {
    title: "Vector, forever",
    body: "Every stroke stays editable. Nothing is flattened until you export.",
  },
  {
    title: "Local-first",
    body: "Changes save on your device before the network. It works on a plane.",
  },
  {
    title: "Multiplayer by default",
    body: "Every tool is built for two people editing the same page at once.",
  },
  {
    title: "Any input",
    body: "Stylus, touch, mouse and keyboard are all first-class. One key per tool.",
  },
] as const;

/** Targets from SPEC.md section 26. */
export const budgets = [
  { prefix: "<", value: "16 ms", label: "pen down to pixels" },
  { prefix: "", value: "60 fps", label: "with 100,000 elements on a canvas" },
  { prefix: "<", value: "150 ms", label: "for a teammate's stroke to reach you" },
  { prefix: "<", value: "1.5 s", label: "to the first page of a document" },
] as const;

export const shortcuts = [
  { key: "V", tool: "Select" },
  { key: "P", tool: "Pen" },
  { key: "H", tool: "Highlighter" },
  { key: "E", tool: "Eraser" },
  { key: "L", tool: "Lasso" },
  { key: "T", tool: "Text" },
  { key: "R", tool: "Rectangle" },
  { key: "O", tool: "Ellipse" },
  { key: "A", tool: "Arrow" },
  { key: "N", tool: "Sticky" },
  { key: "K", tool: "Laser" },
] as const;

export const audiences = [
  {
    who: "Students",
    body: "Annotate lecture slides, record the lecture alongside, and turn highlights into flashcards before the exam.",
  },
  {
    who: "Teachers",
    body: "Present from your notes, hand every student their own copy, and see all of them in one grid.",
  },
  {
    who: "Engineers & designers",
    body: "Sketch systems with real connectors, paste Mermaid, and keep the diagram next to the spec it explains.",
  },
  {
    who: "Review teams",
    body: "Read contracts and specs together, comment on the exact sentence, and track who approved what.",
  },
] as const;

export const faqs = [
  {
    q: "Does it work offline?",
    a: "Yes. Every change is saved on your device first and synced when you're back online. Documents you pin stay fully available offline, PDFs included, and edits made offline merge with everyone else's without conflict prompts.",
  },
  {
    q: "Do you change my original PDF?",
    a: "Never. The file you import is stored exactly as uploaded. Your ink, highlights and comments live on top of it as separate, editable layers until you export.",
  },
  {
    q: "Which devices and styluses does it support?",
    a: "Any modern browser on a laptop or desktop, iPad with Apple Pencil, and Android tablets with S Pen, with pressure, tilt and palm rejection. On phones it's tuned for reading, markup and quick notes. You can also install it as an app.",
  },
  {
    q: "Will my annotations open in Acrobat or Preview?",
    a: "Yes. Export as a flattened PDF, or as a PDF with standard annotations that stay editable in Acrobat and Preview. You can also export only the markup layer.",
  },
  {
    q: "Can I bring my GoodNotes or Notability notes?",
    a: "Import their PDF exports, and they come in as pages you can keep writing on. PowerPoint, Word, images, SVG and Excalidraw files import too.",
  },
  {
    q: "What happens to my documents when I use AI?",
    a: "Content is sent to the model only when you run an AI action, and results appear as a preview you choose to insert. Workspace owners can turn AI off entirely.",
  },
  {
    q: "Is there a student discount?",
    a: "Yes. Verify a college email address to get student pricing on Pro. Schools and colleges can get Team at a discount for whole classes.",
  },
  {
    q: "Who can see my documents?",
    a: "Only you, until you share. Share with people as viewer, commenter or editor, or create a link with an expiry date, a password and a download toggle. Permissions are enforced on the server, not just hidden in the interface.",
  },
  {
    q: "Can I take everything with me if I leave?",
    a: "Yes. Export a ZIP with every document, image and recording, or a full-fidelity backup you can import again. Deleting your account removes your files and data.",
  },
] as const;
