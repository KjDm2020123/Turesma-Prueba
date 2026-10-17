const REPORT_STYLES = `
  <style>
    :root {
      color-scheme: light;
      --report-ink: #0b0f1a;
      --report-accent: #e31e24;
      --report-muted: #64748b;
      --report-border: #e2e8f0;
      --report-surface: #f8fafc;
    }
    html { background: #fff; }
    body {
      color: #1e293b;
      font-family: Arial, Helvetica, sans-serif;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
    .report-logo {
      display: block;
      width: auto;
      max-width: 180px;
      max-height: 68px;
      margin: 0 auto;
      object-fit: contain;
    }
    table { page-break-inside: auto; }
    thead { display: table-header-group; }
    tr, .kpi, .box { break-inside: avoid; page-break-inside: avoid; }
    th {
      background-color: var(--report-ink) !important;
      color: #fff !important;
    }
    .noprint { break-inside: avoid; }
    @page { size: A4; margin: 14mm; }
    @media print {
      html, body { background: #fff !important; }
      body { padding: 0 !important; margin: 0 !important; }
      .noprint { display: none !important; }
      a { color: inherit; text-decoration: none; }
    }
  </style>`;

export function escapeReportHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function openPrintableReport(html: string, features?: string): Window | null {
  const reportWindow = window.open("", "_blank", features);
  if (!reportWindow) return null;

  const documentHtml = html.replace("</head>", `${REPORT_STYLES}</head>`);
  reportWindow.document.open();
  reportWindow.document.write(documentHtml);
  reportWindow.document.close();
  return reportWindow;
}
