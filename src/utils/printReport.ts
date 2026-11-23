import html2canvas from 'html2canvas-pro';
import { escapeHtml } from './safeUrl';

/**
 * Print een specifiek HTML element in een geïsoleerd document.
 * 
 * Voorkomt de Chromium print-bug waarbij pagina 1 zich herhaalt in plaats van
 * natuurlijk over te lopen. Dit treedt op wanneer window.print()
 * wordt aangeroepen op een element binnen een modal met fixed/overflow CSS.
 * 
 * Behoudt 100% alle Tailwind CSS styling, badges, inline SVG charts en kleuren via
 * -webkit-print-color-adjust: exact.
 */
export function printHtmlReport(element: HTMLElement, title: string): void {
  // 1. Verwijder eventuele oude print-iframes
  document.querySelectorAll('iframe[data-print-report="true"]').forEach(el => el.remove());

  // 2. Kloon het element en verwijder no-print én eventuele actieve tags (defense-in-depth tegen XSS)
  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.no-print, script, iframe, object, embed').forEach(node => node.remove());

  // 3. Verzamel alle actieve stylesheets en inline styles van de pagina
  let stylesHtml = '';
  document.querySelectorAll('style, link[rel="stylesheet"]').forEach(node => {
    // Sla stijlen over die visibility: hidden op body * bevatten om te vermijden dat ze het rapport verbergen
    if (node.tagName.toLowerCase() === 'style' && node.textContent?.includes('visibility: hidden')) {
      return;
    }
    stylesHtml += node.outerHTML + '\n';
  });

  const fullHtml = `<!DOCTYPE html>
<html lang="nl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    ${stylesHtml}
    <style>
      @page {
        size: A4 portrait;
        margin: 8mm 10mm;
      }
      *, *::before, *::after {
        box-sizing: border-box !important;
      }
      html, body {
        background: #ffffff !important;
        color: #0f172a !important;
        margin: 0 !important;
        padding: 0 !important;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        overflow: visible !important;
        height: auto !important;
        min-height: 0 !important;
        visibility: visible !important;
      }
      body * {
        visibility: visible !important;
      }
      #print-page-wrapper {
        width: 100% !important;
        max-width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
      }
      /* Zorg dat de afgedrukte container volle breedte heeft en geen schaduw */
      #print-page-wrapper > * {
        width: 100% !important;
        max-width: 100% !important;
        margin: 0 !important;
        box-shadow: none !important;
        border-color: #cbd5e1 !important;
      }
      /* Natuurlijke flow zonder herhalende pagina's */
      table {
        page-break-inside: auto !important;
        break-inside: auto !important;
        width: 100% !important;
        border-collapse: collapse !important;
      }
      tr {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      thead {
        display: table-header-group !important;
      }
      tfoot {
        display: table-footer-group !important;
      }
      .avoid-break, .break-inside-avoid, [data-avoid-break="true"] {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      .no-print {
        display: none !important;
      }
    </style>
  </head>
  <body class="p-2 sm:p-3 bg-white text-slate-900">
    <div id="print-page-wrapper">
      ${clone.outerHTML}
    </div>
  </body>
</html>`;

  // 4. Gebruik een iframe met volledige afmetingen (achter de pagina)
  // Belangrijk: 0x0 afmetingen zorgen in Chromium voor een lege/witte print preview!
  const iframe = document.createElement('iframe');
  iframe.setAttribute('data-print-report', 'true');
  iframe.style.position = 'fixed';
  iframe.style.left = '0';
  iframe.style.top = '0';
  iframe.style.width = '1024px';
  iframe.style.height = '768px';
  iframe.style.border = '0';
  iframe.style.zIndex = '-99999';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    window.print();
    return;
  }

  doc.open();
  doc.write(fullHtml);
  doc.close();

  let hasExecutedPrint = false;
  const executePrint = () => {
    if (hasExecutedPrint) return;
    hasExecutedPrint = true;
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (err) {
      console.error('Fout bij afdrukken via iframe:', err);
      window.print();
    }
  };

  // Wacht tot styles en fonts geladen zijn
  if (iframe.contentWindow) {
    iframe.onload = () => {
      setTimeout(executePrint, 250);
    };
  }
  // Fallback timeout indien onload niet triggert na doc.write
  setTimeout(executePrint, 500);
}

/**
 * Exporteert een element direct als haarscherpe PNG afbeelding.
 * Ondersteunt Tailwind v4 oklch-kleuren via html2canvas-pro.
 * Ideaal om via WhatsApp, e-mail of social media door te sturen.
 */
export async function exportElementAsImage(
  element: HTMLElement,
  filename: string,
  onLoading?: (loading: boolean) => void
): Promise<void> {
  try {
    onLoading?.(true);

    // Zorg dat fonts klaar zijn
    if (document.fonts?.ready) {
      try {
        await document.fonts.ready;
      } catch {
        // Negeer font loading errors
      }
    }

    const canvas = await html2canvas(element, {
      scale: 2, // 2x resolutie voor haarscherpe kwaliteit op elk scherm
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: 1024,
      onclone: (clonedDoc, clonedEl) => {
        // Zorg dat dark mode niet meegenomen wordt in de afbeelding
        clonedDoc.documentElement.classList.remove('dark');
        clonedDoc.body.classList.remove('dark');

        clonedEl.style.width = '880px';
        clonedEl.style.maxWidth = '880px';
        clonedEl.style.minWidth = '880px';
        clonedEl.style.height = 'auto';
        clonedEl.style.maxHeight = 'none';
        clonedEl.style.overflow = 'visible';
        clonedEl.style.background = '#ffffff';

        clonedEl.querySelectorAll('.no-print').forEach((node: any) => {
          node.style.display = 'none';
        });
      }
    });

    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    const safeTitle = (filename || 'export').replace(/[^a-zA-Z0-9_-]/g, '_');
    link.download = `${safeTitle}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err: any) {
    console.error('Fout bij exporteren als afbeelding:', err);
    alert(`Er is een fout opgetreden bij het exporteren van de afbeelding: ${err?.message || err}`);
  } finally {
    onLoading?.(false);
  }
}
