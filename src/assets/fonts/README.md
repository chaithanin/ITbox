# Fonts

- `NotoSansThai-Regular.ttf` — Noto Sans Thai from Google Fonts
  (https://fonts.google.com/noto/specimen/Noto+Sans+Thai), licensed under the
  SIL Open Font License 1.1 (OFL). Used by the PDF report exporter
  (`src/app/api/reports/[report]/route.ts`) so Thai text renders correctly.
  The file is read at runtime via `process.cwd()`, which keeps it traced into
  Next.js standalone builds.
