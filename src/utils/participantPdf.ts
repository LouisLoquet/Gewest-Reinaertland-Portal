import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Form, FormField, FormSubmission } from '../types/form';
import { escapeHtml } from './safeUrl';

export function getFieldAnswer(sub: FormSubmission, fields: FormField[], matchTerms: string[]): string {
  for (const f of fields || []) {
    const lbl = (f.label || '').toLowerCase();
    if (matchTerms.some(t => lbl.includes(t))) {
      const val = sub.data?.[f.id];
      if (val !== undefined && val !== null && val !== '') {
        return Array.isArray(val) ? val.join(', ') : String(val);
      }
    }
  }
  return '';
}

export function isLeidingSubmission(sub: FormSubmission, fields: FormField[]): boolean {
  const group = getFieldAnswer(sub, fields, ['groep', 'chirogroep', 'afdeling', 'chiro', 'tak']);
  const role = getFieldAnswer(sub, fields, ['functie', 'rol', 'leiding', 'begeleiding']);
  return (
    /leiding/i.test(group) ||
    /leiding/i.test(role) ||
    group.trim().toUpperCase() === 'LEIDING'
  );
}

/**
 * Genereert een haarscherpe, vector-gebaseerde PDF van de deelnemerslijst
 * met exact dezelfde visuele elementen als de preview:
 * - Oranje accentbalk en oranje subtitel
 * - Statistiekenbadge rechtsboven (totaal, leden/leiding, betaalstatus)
 * - Nette zebra-striping en duidelijke hoofdingen
 * - Zachte gekleurde labels voor allergieën en betaalstatus
 * - Aanwezigheidsvakjes voor leiding ter plaatse
 * - Gescheiden leiding-sectie met donkere banner en leiding-badges
 * - Professionele paginanummering en voettekst op iedere pagina
 */
export function generateParticipantListPdf(form: Form, submissions: FormSubmission[]) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const fields = form.fields || [];
  const leden = submissions.filter(s => !isLeidingSubmission(s, fields));
  const leiding = submissions.filter(s => isLeidingSubmission(s, fields));

  const requirePayment = true;
  const paymentAmount = Number(form.paymentAmount || 0);
  const paidCount = submissions.filter(s => s.isPaid).length;
  const totalPaidAmount = paidCount * paymentAmount;

  const dateStr = new Date().toLocaleDateString('nl-BE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // 1. Oranje accentbalk bovenaan de pagina (4mm)
  doc.setFillColor(234, 88, 12); // orange-600
  doc.rect(0, 0, 210, 4, 'F');

  // 2. Document header banner
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(234, 88, 12);
  doc.text('GEWEST REINAERTLAND • DEELNEMERSLIJST', 14, 12);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(form.title || 'Deelnemerslijst', 14, 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text(`Afgedrukt op ${dateStr}`, 14, 25);

  // 3. Statistiekenbadge rechtsboven
  const boxW = 58;
  const boxH = requirePayment ? 18 : 14;
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(203, 213, 225); // slate-300
  doc.roundedRect(210 - 14 - boxW, 8.5, boxW, boxH, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59); // slate-800
  doc.text(`Totaal: ${submissions.length} deelnemers`, 210 - 14 - boxW + 3, 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`${leden.length} Leden • ${leiding.length} Leiding`, 210 - 14 - boxW + 3, 18.5);

  if (requirePayment) {
    doc.setTextColor(16, 149, 90); // emerald-600
    doc.setFont('helvetica', 'bold');
    doc.text(
      totalPaidAmount > 0
        ? `${paidCount} van ${submissions.length} betaald (€${totalPaidAmount.toFixed(2)})`
        : `${paidCount} van ${submissions.length} betaald`,
      210 - 14 - boxW + 3,
      23
    );
  }

  // 4. Scheidingslijn onder header
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.6);
  doc.line(14, 28.5, 196, 28.5);

  const headRow = requirePayment
    ? ['#', 'Deelnemer', 'Chirogroep / Afdeling', 'Contact', 'Allergieën / Dieet / Opmerkingen', 'Betaald', 'Aanwezig']
    : ['#', 'Deelnemer', 'Chirogroep / Afdeling', 'Contact', 'Allergieën / Dieet / Opmerkingen', 'Aanwezig'];

  const colStyles = requirePayment
    ? {
        0: { cellWidth: 8, halign: 'center' as const, fontStyle: 'bold' as const },
        1: { cellWidth: 38, fontStyle: 'bold' as const },
        2: { cellWidth: 34 },
        3: { cellWidth: 30 },
        4: { cellWidth: 44 },
        5: { cellWidth: 14, halign: 'center' as const },
        6: { cellWidth: 14, halign: 'center' as const },
      }
    : {
        0: { cellWidth: 8, halign: 'center' as const, fontStyle: 'bold' as const },
        1: { cellWidth: 44, fontStyle: 'bold' as const },
        2: { cellWidth: 38 },
        3: { cellWidth: 34 },
        4: { cellWidth: 44 },
        5: { cellWidth: 14, halign: 'center' as const },
      };

  let currentY = 34;

  const drawBadgesAndBoxes = (data: any, isLeaderTable: boolean) => {
    if (data.section === 'body') {
      const isPaidCol = requirePayment && data.column.index === 5;
      const isAanwezigCol = requirePayment ? data.column.index === 6 : data.column.index === 5;

      // Betaald pill badge
      if (isPaidCol) {
        const isPaid = data.cell.raw === 'Ja';
        const bw = 11;
        const bh = 4.5;
        const bx = data.cell.x + (data.cell.width - bw) / 2;
        const by = data.cell.y + (data.cell.height - bh) / 2;
        if (isPaid) {
          doc.setFillColor(209, 250, 229); // emerald-100
          doc.setDrawColor(110, 231, 183); // emerald-300
          doc.roundedRect(bx, by, bw, bh, 1, 1, 'FD');
          doc.setTextColor(6, 95, 70); // emerald-800
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.text('Ja', bx + bw / 2, by + 3.2, { align: 'center' });
        } else {
          doc.setFillColor(254, 243, 199); // amber-100
          doc.setDrawColor(252, 211, 77); // amber-300
          doc.roundedRect(bx, by, bw, bh, 1, 1, 'FD');
          doc.setTextColor(146, 64, 14); // amber-800
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.text('Nee', bx + bw / 2, by + 3.2, { align: 'center' });
        }
      }

      // Aanwezig checkbox vierkantje
      if (isAanwezigCol) {
        const boxSize = 4;
        const bx = data.cell.x + (data.cell.width - boxSize) / 2;
        const by = data.cell.y + (data.cell.height - boxSize) / 2;
        doc.setDrawColor(148, 163, 184); // slate-400
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(bx, by, boxSize, boxSize, 0.8, 0.8, 'FD');
      }

      // Allergieën pill badge
      if (data.column.index === 4 && data.cell.raw && data.cell.raw !== '-') {
        const text = String(data.cell.raw);
        const padX = 1.5;
        const padY = 1.2;
        const bw = data.cell.width - padX * 2;
        const bh = data.cell.height - padY * 2;
        doc.setFillColor(254, 243, 199); // amber-100
        doc.setDrawColor(252, 211, 77); // amber-300
        doc.roundedRect(data.cell.x + padX, data.cell.y + padY, bw, bh, 0.8, 0.8, 'FD');
        doc.setTextColor(146, 64, 14); // amber-800
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        const lines = doc.splitTextToSize(`! ${text}`, bw - 2);
        doc.text(lines, data.cell.x + padX + 1.2, data.cell.y + padY + 3);
      }

      // Leiding Deelnemer: naam + zwarte leiding-badge
      if (isLeaderTable && data.column.index === 1) {
        const name = String(data.cell.raw || '');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(15, 23, 42);
        doc.text(name, data.cell.x + 2, data.cell.y + 3.8);

        const badgeW = 12;
        const badgeH = 3.5;
        const bx = data.cell.x + 2;
        const by = data.cell.y + 5.2;
        doc.setFillColor(15, 23, 42); // slate-900
        doc.roundedRect(bx, by, badgeW, badgeH, 0.6, 0.6, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5.5);
        doc.text('LEIDING', bx + badgeW / 2, by + 2.5, { align: 'center' });
      }
    }
  };

  // ─── 1. SECTIE: LEDEN ──────────────────────────────────────────
  if (leden.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(234, 88, 12);
    doc.text(`LEDEN (${leden.length})`, 14, currentY);

    const ledenRows = leden.map((s, idx) => {
      const name = getFieldAnswer(s, fields, ['naam', 'voornaam', 'achternaam', 'wie', 'kapitein', 'deelnemer']) || s.respondentEmail || `Deelnemer #${idx + 1}`;
      const group = getFieldAnswer(s, fields, ['groep', 'chirogroep', 'afdeling', 'chiro']) || '-';
      const phone = getFieldAnswer(s, fields, ['tel', 'gsm', 'mobiel', 'telefoon', 'contact', 'noodnummer']) || s.respondentEmail || '-';
      const allergies = getFieldAnswer(s, fields, ['allerg', 'dieet', 'vegetar', 'vegan', 'eten', 'voeding', 'medisch', 'ziekte', 'opmerking']) || '-';

      const r = [String(idx + 1), name, group, phone, allergies];
      if (requirePayment) r.push(s.isPaid ? 'Ja' : 'Nee');
      r.push('');
      return r;
    });

    autoTable(doc, {
      startY: currentY + 2.5,
      head: [headRow],
      body: ledenRows,
      theme: 'striped',
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [30, 41, 59],
        fontStyle: 'bold',
        fontSize: 7.2,
        lineWidth: 0.15,
        lineColor: [203, 213, 225],
      },
      bodyStyles: {
        textColor: [51, 65, 85],
        fontSize: 7.2,
        cellPadding: 2.2,
        lineWidth: 0.1,
        lineColor: [226, 232, 240],
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: colStyles,
      didDrawCell: (data) => drawBadgesAndBoxes(data, false),
      didParseCell: (data) => {
        if (data.section === 'body') {
          if (requirePayment && data.column.index === 5) data.cell.text = [];
          if (data.column.index === (requirePayment ? 6 : 5)) data.cell.text = [];
          if (data.column.index === 4 && data.cell.raw && data.cell.raw !== '-') data.cell.text = [];
        }
      },
      margin: { left: 14, right: 14, bottom: 15 },
    });

    currentY = (doc as any).lastAutoTable.finalY + 8;
  }

  // ─── 2. SECTIE: LEIDING (ONDER DE LEDEN) ───────────────────────
  if (leiding.length > 0) {
    if (currentY > 240) {
      doc.addPage();
      currentY = 16;
    }

    // Leiding header banner
    doc.setFillColor(15, 23, 42); // slate-900
    doc.roundedRect(14, currentY, 182, 6.5, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text(`LEIDING & BEGELEIDING (${leiding.length})`, 18, currentY + 4.5);

    const leidingRows = leiding.map((s, idx) => {
      const name = getFieldAnswer(s, fields, ['naam', 'voornaam', 'achternaam', 'wie', 'kapitein', 'deelnemer']) || s.respondentEmail || `Leiding #${idx + 1}`;
      const group = getFieldAnswer(s, fields, ['groep', 'chirogroep', 'afdeling', 'chiro', 'functie', 'rol']) || 'LEIDING';
      const phone = getFieldAnswer(s, fields, ['tel', 'gsm', 'mobiel', 'telefoon', 'contact', 'noodnummer']) || s.respondentEmail || '-';
      const allergies = getFieldAnswer(s, fields, ['allerg', 'dieet', 'vegetar', 'vegan', 'eten', 'voeding', 'medisch', 'ziekte', 'opmerking']) || '-';

      const r = [String(idx + 1), name, group, phone, allergies];
      if (requirePayment) r.push(s.isPaid ? 'Ja' : 'Nee');
      r.push('');
      return r;
    });

    autoTable(doc, {
      startY: currentY + 7.5,
      head: [headRow],
      body: leidingRows,
      theme: 'striped',
      headStyles: {
        fillColor: [226, 232, 240],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        fontSize: 7.2,
        lineWidth: 0.15,
        lineColor: [203, 213, 225],
      },
      bodyStyles: {
        textColor: [51, 65, 85],
        fontSize: 7.2,
        cellPadding: 2.8,
        lineWidth: 0.1,
        lineColor: [226, 232, 240],
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: colStyles,
      didDrawCell: (data) => drawBadgesAndBoxes(data, true),
      didParseCell: (data) => {
        if (data.section === 'body') {
          if (requirePayment && data.column.index === 5) data.cell.text = [];
          if (data.column.index === (requirePayment ? 6 : 5)) data.cell.text = [];
          if (data.column.index === 4 && data.cell.raw && data.cell.raw !== '-') data.cell.text = [];
          if (data.column.index === 1) data.cell.text = [];
        }
      },
      margin: { left: 14, right: 14, bottom: 15 },
    });
  }

  // ─── 5. VOETTEKST EN PAGINANUMMERS OP IEDERE PAGINA ────────────
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(14, 287, 196, 287);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(`Gewest Reinaertland • reinaertland.be  |  ${form.title || 'Deelnemerslijst'}`, 14, 291);
    doc.text(`Pagina ${p} van ${totalPages}`, 196, 291, { align: 'right' });
  }

  const safeTitle = (form.title || 'Deelnemerslijst')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 40);

  doc.save(`Deelnemerslijst_${safeTitle}.pdf`);
}

/**
 * Print de deelnemerslijst via de browser print-engine met alle originele stylesheets,
 * zodat "Opslaan als PDF" in Chrome / Safari / mobiel exact dezelfde opmaak heeft.
 */
export function printParticipantHtml(element: HTMLElement, title: string): void {
  const safeTitle = escapeHtml(title || 'Deelnemerslijst');

  // Kloon het element en verwijder no-print én eventuele script/iframe tags (defense-in-depth tegen DOM XSS)
  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.no-print, script, iframe, object, embed').forEach(node => node.remove());

  let stylesHtml = '';
  document.querySelectorAll('style, link[rel="stylesheet"]').forEach(node => {
    stylesHtml += node.outerHTML;
  });

  const printHtml = `
      <!DOCTYPE html>
      <html lang="nl">
        <head>
          <meta charset="utf-8" />
          <title>${safeTitle} - Deelnemerslijst</title>
          ${stylesHtml}
          <style>
            @page {
              size: A4 portrait;
              margin: 12mm 10mm;
            }
            html, body {
              background: #ffffff !important;
              color: #0f172a !important;
              margin: 0 !important;
              padding: 0 !important;
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            #print-container {
              width: 100% !important;
              max-width: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow: visible !important;
            }
            table {
              page-break-inside: auto !important;
              width: 100% !important;
              border-collapse: collapse !important;
            }
            tr {
              page-break-inside: avoid !important;
              page-break-after: auto !important;
            }
            thead {
              display: table-header-group !important;
            }
            .no-print {
              display: none !important;
            }
          </style>
        </head>
        <body class="p-4 bg-white text-slate-900">
          <div id="print-container">
            ${clone.innerHTML}
          </div>
        </body>
      </html>
    `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.opener = null;
    printWindow.document.open();
    printWindow.document.write(printHtml);
    printWindow.document.close();

    // Geen inline <script> nodig (werkt volledig onder strikte CSP zonder 'unsafe-inline')
    let printed = false;
    const triggerPrint = () => {
      if (printed) return;
      printed = true;
      try {
        printWindow.focus();
        printWindow.print();
        setTimeout(() => {
          try { printWindow.close(); } catch {}
        }, 1200);
      } catch {}
    };
    printWindow.onload = triggerPrint;
    setTimeout(triggerPrint, 450);
    return;
  }

  // Fallback iframe voor situaties waarin pop-up geblokkeerd is
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) return;

  doc.open();
  doc.write(printHtml);
  doc.close();

  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }, 2500);
  }, 350);
}
