# OVIA Workflow Atlas

A separate local Next.js, React, TypeScript, React Flow and Tailwind application documenting OVIA's architecture. The original OVIA checkout and production website were not modified.

## Deploy with Vercel

Import `carraci/ovia-workflow-editor` as a new Vercel project. Use the **Next.js** framework preset, root directory `./`, and build command `npm run build`. No OVIA database credentials or provider API keys are needed. The build generates the ZIP download from source and existing exports using Node.js; Python is only needed when regenerating PDFs locally.

The deployed editor documents a fixed source snapshot. Browser edits remain local to each browser. GitHub pushes to the configured production branch can trigger future Vercel deployments after you connect the repository.

## Open the editor

```powershell
cd 'C:\Users\Adarsh\OneDrive\Pictures\n8n\ovia-workflow-editor'
npm install
npm run dev
```

Open http://127.0.0.1:3100. For the verified production build, use `npm run build` then `npm start`. The editor needs no OVIA credentials, database connection or payment account.

## Included

- 20 business workflows and 18 architecture/domain diagrams, including separate MongoDB connectivity and entity relationship views.
- Source evidence for implemented nodes; planned extensions have explicit badges and dashed connections.
- 86 route files, 152 exported HTTP handlers, 72 explicitly reviewed dispatcher endpoints, 73 page files and 48 code-backed collection names.
- 20 integration entries distinguish adapter code, configuration-only checks and unverified operational state.
- Draggable nodes, proposed connections, minimap, zoom, pan, automatic layout, node search and details, editable labels, undo/redo and fullscreen.
- Local browser persistence and JSON import/export. SVG and PNG downloads reflect current positions, labels and connections. PDF download includes the graph overview, readable node details and connection register.
- Static source-snapshot exports in `public/exports`: individual SVG, PNG, JSON and A4 landscape PDF files, combined master and complete PDFs, source mapping report and inventories.

## Source snapshot

Repository: https://github.com/carraci/ovias-shop

Commit: `1594c695e6f8a0ffc4709ce12965b096a5f9182f`.

The read-only inspection checkout is `../ovia-inspection`. All source/script/test code was scanned; environment files and runtime credentials were excluded. A static source review cannot establish production configuration or actual provider connectivity. Read `public/exports/source-code-mapping-report.md` for findings and limitations.

These are documentation graphs. They are not executable n8n workflows and JSON is not an n8n import format. Branches may combine user interactions and separate API requests; the notes explain these boundaries. API call-scope inspection is static and does not claim conditional service calls execute in the order shown.

## Editing

Click a node to inspect source and edit its label. Add a proposed node using the toolbar or drag from the palette. Drag between handles to propose a connection. Delete selected nodes/edges using Backspace/Delete, or remove a node in its details. Undo with Ctrl+Z; redo with Ctrl+Y or Ctrl+Shift+Z. Restore source resets the selected diagram and can be undone.

Local changes stay in this browser under versioned localStorage keys. Download JSON for a portable copy. Static master/all-diagram downloads document the original source snapshot; they do not include browser edits. Current-diagram exports include browser edits.

## Regenerate inventories and diagrams

Run these from this editor folder. Source paths are read-only.

```powershell
node scripts/scan.mjs ../ovia-inspection
node scripts/enrich.mjs
node scripts/build-data.mjs
npm run verify
npm run export
```

The curated diagrams and dispatcher inventory are intentionally source-specific. When updating to another OVIA commit, review evidence markers, dispatch branches, planned features and diagram edges rather than assuming regeneration proves semantic correctness.

PDF generation uses Python with ReportLab and pypdf. The export script defaults to the installed Codex bundled Python on this computer. On another computer, set `OVIA_PDF_PYTHON` to a Python executable containing those packages. PNG generation uses Sharp. Poppler is used for visual PDF review.

## Verification

`npm run verify` checks graph structure, start/end paths, actual evidence files/lines, node overlap, edge/node collisions, label collisions and credential-literal exclusion. The separate browser check validates editing, local persistence, downloads, all diagram selections, source links, inventory and responsive rendering. Its default runner uses the Codex bundled Playwright and installed Chrome; adjust `scripts/browser-qa.mjs` if using another environment.

Reports: `output/verification.json`, `output/browser-verification.json`, `public/exports/pdf-verification.json` and `output/qa` screenshots.

Provider transactions, production data and credentials are intentionally outside this local documentation application.
