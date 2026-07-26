const {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  PageBreak,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType
} = require('docx');

const COLORS = {
  navy: '173E56',
  teal: '2D7180',
  text: '183246',
  muted: '607786',
  pale: 'E9F1F5',
  soft: 'F5F9FB',
  line: 'C7D6DE',
  white: 'FFFFFF'
};

const A4_WIDTH = 11906;
const A4_HEIGHT = 16838;
const mmToTwip = (value) => Math.round(Number(value) * 1440 / 25.4);

function billLayout(bill = {}) {
  const rowCount = Array.isArray(bill.righe) ? bill.righe.length : 0;
  const burden = rowCount + (bill.banca ? 0.5 : 0) + (bill.pagamento ? 1 : 0) + (bill.nota ? 1 : 0);
  const extra = Math.max(0, burden - 4);
  return {
    scale: Math.max(0.62, 1 - (extra * 0.06)),
    rowScale: Math.max(0.5, 1 - (extra * 0.075))
  };
}

function scaled(value, layout, minimum = 0, key = 'scale') {
  const factor = Number(layout?.[key]) || 1;
  return Math.max(minimum, Math.round(Number(value) * factor));
}

function safeText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function money(value) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function borders(color = COLORS.line, size = 5) {
  const edge = { style: BorderStyle.SINGLE, size, color };
  return { top: edge, bottom: edge, left: edge, right: edge, insideHorizontal: edge, insideVertical: edge };
}

function noBorders() {
  const edge = { style: BorderStyle.NONE, size: 0, color: COLORS.white };
  return { top: edge, bottom: edge, left: edge, right: edge, insideHorizontal: edge, insideVertical: edge };
}

function topBorder(color = COLORS.muted, size = 6) {
  const none = { style: BorderStyle.NONE, size: 0, color: COLORS.white };
  return {
    top: { style: BorderStyle.SINGLE, size, color },
    bottom: none,
    left: none,
    right: none,
    insideHorizontal: none,
    insideVertical: none
  };
}

function run(text, options = {}) {
  return new TextRun({
    text: safeText(text),
    font: options.font || 'Arial',
    size: options.size || 18,
    bold: Boolean(options.bold),
    color: options.color || COLORS.text,
    break: options.break || 0
  });
}

function paragraph(children, options = {}) {
  const normalized = Array.isArray(children) ? children : [run(children, options)];
  return new Paragraph({
    children: normalized,
    alignment: options.alignment || AlignmentType.LEFT,
    spacing: {
      before: options.before || 0,
      after: options.after ?? 0,
      line: options.line || 240
    },
    keepNext: Boolean(options.keepNext),
    pageBreakBefore: Boolean(options.pageBreakBefore)
  });
}

function labelValue(label, value, options = {}) {
  const children = [
    run(String(label || '').toUpperCase(), { size: options.labelSize || 14, bold: true, color: COLORS.teal }),
    run(safeText(value, '—'), {
      size: options.valueSize || 19,
      bold: options.bold !== false,
      color: options.valueColor || COLORS.navy,
      break: 1
    })
  ];
  if (options.detail) {
    children.push(run(options.detail, { size: options.detailSize || 15, color: COLORS.muted, break: 1 }));
  }
  return paragraph(children, { line: options.line || 260 });
}

function cell(children, width, options = {}) {
  return new TableCell({
    children: Array.isArray(children) ? children : [children],
    width: { size: width, type: WidthType.DXA },
    verticalAlign: options.verticalAlign || VerticalAlign.CENTER,
    shading: options.fill ? { fill: options.fill, type: ShadingType.CLEAR, color: 'auto' } : undefined,
    borders: options.borders || (options.borderless ? noBorders() : borders(options.borderColor || COLORS.line, options.borderSize || 5)),
    margins: {
      top: options.marginTop ?? 110,
      bottom: options.marginBottom ?? 110,
      left: options.marginLeft ?? 150,
      right: options.marginRight ?? 150
    },
    columnSpan: options.columnSpan
  });
}

function fixedTable(width, widths, rows, options = {}) {
  return new Table({
    width: { size: width, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    alignment: AlignmentType.LEFT,
    borders: options.borderless ? noBorders() : borders(options.borderColor || COLORS.line, options.borderSize || 5),
    rows
  });
}

function tableSpacer(points = 4, layout = null) {
  return paragraph('', {
    after: scaled(points * 20, layout, 20),
    line: scaled(40, layout, 20)
  });
}

function dataUrlImage(dataUrl) {
  const match = /^data:image\/(png|jpe?g);base64,([a-z0-9+/=]+)$/i.exec(String(dataUrl || '').trim());
  if (!match) return null;
  return {
    type: match[1].toLowerCase() === 'png' ? 'png' : 'jpg',
    data: Buffer.from(match[2], 'base64')
  };
}

function headerTable(studio, width, layout) {
  const widths = [
    Math.round(width * 0.27),
    Math.round(width * 0.48),
    width - Math.round(width * 0.27) - Math.round(width * 0.48)
  ];
  const logo = dataUrlImage(studio.logo);
  const brandChildren = logo
    ? [paragraph([new ImageRun({
      data: logo.data,
      type: logo.type,
      transformation: {
        width: scaled(150, layout, 105),
        height: scaled(76, layout, 53)
      }
    })])]
    : [paragraph([
      run('LOCA ', { size: scaled(38, layout, 26), bold: true, color: COLORS.navy }),
      run('PRO', { size: scaled(38, layout, 26), bold: true, color: COLORS.teal })
    ])];

  const officeLines = [
    paragraph(studio.nome || 'MAGGI RICCARDO', {
      size: scaled(22, layout, 16),
      bold: true,
      color: COLORS.navy,
      after: scaled(35, layout, 20)
    }),
    ...[studio.fiscale, studio.sede, ...(studio.contatti || [])]
      .filter(Boolean)
      .map(value => paragraph(value, {
        size: scaled(14, layout, 11),
        color: COLORS.muted,
        after: scaled(15, layout, 8),
        line: scaled(210, layout, 150)
      }))
  ];

  return fixedTable(width, widths, [
    new TableRow({
      cantSplit: true,
      children: [
        cell(brandChildren, widths[0], { borderless: true, marginLeft: 0, marginTop: 0, marginBottom: scaled(110, layout, 55) }),
        cell(officeLines, widths[1], { borderless: true, marginTop: 0, marginBottom: scaled(110, layout, 55) }),
        cell([
          paragraph('COMUNICAZIONE', {
            size: scaled(17, layout, 12),
            bold: true,
            color: COLORS.navy,
            alignment: AlignmentType.RIGHT,
            after: scaled(35, layout, 20)
          }),
          paragraph([
            run('Predisposta in nome', { size: scaled(14, layout, 11), color: COLORS.muted }),
            run('e per conto della proprietà', { size: scaled(14, layout, 11), color: COLORS.muted, break: 1 })
          ], { alignment: AlignmentType.RIGHT, line: scaled(220, layout, 155) })
        ], widths[2], { borderless: true, marginRight: 0, marginTop: 0, marginBottom: scaled(110, layout, 55) })
      ]
    })
  ], { borderless: true });
}

function recipientTable(bill, width, layout) {
  const left = Math.round(width * 0.58);
  const right = width - left;
  return fixedTable(width, [left, right], [
    new TableRow({
      cantSplit: true,
      children: [
        cell([
          labelValue('Spett.le', bill.conduttore, {
            labelSize: scaled(14, layout, 11),
            valueSize: scaled(22, layout, 15)
          }),
          paragraph(bill.immobile, {
            size: scaled(17, layout, 12),
            color: COLORS.muted,
            after: scaled(25, layout, 10)
          })
        ], left, {
          fill: 'F8FBFC',
          marginTop: scaled(155, layout, 70),
          marginBottom: scaled(155, layout, 70),
          marginLeft: 220,
          marginRight: 220
        }),
        cell([
          paragraph('BOLLETTA DI LOCAZIONE', {
            size: scaled(15, layout, 11),
            bold: true,
            color: COLORS.teal,
            alignment: AlignmentType.CENTER,
            after: scaled(55, layout, 22)
          }),
          paragraph(bill.periodoTitolo, {
            size: scaled(22, layout, 15),
            bold: true,
            color: COLORS.navy,
            alignment: AlignmentType.CENTER,
            after: scaled(55, layout, 22)
          }),
          paragraph('Scadenza pagamento:', {
            size: scaled(14, layout, 10),
            color: COLORS.muted,
            alignment: AlignmentType.CENTER,
            after: scaled(20, layout, 8)
          }),
          paragraph(bill.scadenza, {
            size: scaled(22, layout, 15),
            bold: true,
            color: COLORS.navy,
            alignment: AlignmentType.CENTER
          })
        ], right, {
          marginTop: 0,
          marginBottom: scaled(130, layout, 60),
          marginLeft: 90,
          marginRight: 90
        })
      ]
    })
  ]);
}

function infoTable(bill, width, layout) {
  const first = Math.floor(width / 3);
  const widths = [first, first, width - (first * 2)];
  return fixedTable(width, widths, [
    new TableRow({
      cantSplit: true,
      children: [
        cell(labelValue('Proprietà', bill.proprietario, {
          labelSize: scaled(14, layout, 10),
          valueSize: scaled(19, layout, 13),
          detailSize: scaled(15, layout, 10),
          line: scaled(260, layout, 170),
          detail: bill.cfLocatore ? `Codice fiscale: ${bill.cfLocatore}` : ''
        }), widths[0], {
          marginTop: scaled(135, layout, 55),
          marginBottom: scaled(135, layout, 55)
        }),
        cell(labelValue('Immobile', bill.immobile, {
          labelSize: scaled(14, layout, 10),
          valueSize: scaled(19, layout, 13),
          detailSize: scaled(15, layout, 10),
          line: scaled(260, layout, 170),
          detail: bill.tipologia || 'Unità immobiliare locata'
        }), widths[1], {
          marginTop: scaled(135, layout, 55),
          marginBottom: scaled(135, layout, 55)
        }),
        cell(labelValue('Periodo di competenza', bill.periodoTitolo, {
          labelSize: scaled(14, layout, 10),
          valueSize: scaled(19, layout, 13),
          detailSize: scaled(15, layout, 10),
          line: scaled(260, layout, 170),
          detail: `${bill.dal} – ${bill.al}`
        }), widths[2], {
          marginTop: scaled(135, layout, 55),
          marginBottom: scaled(135, layout, 55)
        })
      ]
    })
  ]);
}

function financialTable(bill, width, layout) {
  const left = Math.round(width * 0.74);
  const right = width - left;
  const rows = [
    new TableRow({
      cantSplit: true,
      tableHeader: true,
      children: [
        cell(paragraph('DESCRIZIONE', {
          size: scaled(15, layout, 10, 'rowScale'),
          bold: true,
          color: COLORS.white
        }), left, {
          fill: COLORS.navy,
          borderColor: COLORS.navy,
          marginTop: scaled(110, layout, 40, 'rowScale'),
          marginBottom: scaled(110, layout, 40, 'rowScale')
        }),
        cell(paragraph('IMPORTO', {
          size: scaled(15, layout, 10, 'rowScale'),
          bold: true,
          color: COLORS.white,
          alignment: AlignmentType.RIGHT
        }), right, {
          fill: COLORS.navy,
          borderColor: COLORS.navy,
          marginTop: scaled(110, layout, 40, 'rowScale'),
          marginBottom: scaled(110, layout, 40, 'rowScale')
        })
      ]
    }),
    ...(bill.righe || []).map((item, index) => new TableRow({
      cantSplit: true,
      children: [
        cell(paragraph(item.descrizione, {
          size: scaled(17, layout, 11, 'rowScale'),
          line: scaled(240, layout, 155, 'rowScale')
        }), left, {
          fill: index % 2 ? 'F7FAFB' : COLORS.white,
          marginTop: scaled(110, layout, 35, 'rowScale'),
          marginBottom: scaled(110, layout, 35, 'rowScale')
        }),
        cell(paragraph(money(item.importo), {
          size: scaled(17, layout, 11, 'rowScale'),
          bold: true,
          alignment: AlignmentType.RIGHT,
          line: scaled(240, layout, 155, 'rowScale')
        }), right, {
          fill: index % 2 ? 'F7FAFB' : COLORS.white,
          marginTop: scaled(110, layout, 35, 'rowScale'),
          marginBottom: scaled(110, layout, 35, 'rowScale')
        })
      ]
    })),
    new TableRow({
      cantSplit: true,
      children: [
        cell(paragraph('TOTALE DA PAGARE', {
          size: scaled(18, layout, 12, 'rowScale'),
          bold: true,
          color: COLORS.white
        }), left, {
          fill: COLORS.navy,
          borderColor: COLORS.navy,
          marginTop: scaled(110, layout, 45, 'rowScale'),
          marginBottom: scaled(110, layout, 45, 'rowScale')
        }),
        cell(paragraph(money(bill.totale), {
          size: scaled(26, layout, 17, 'rowScale'),
          bold: true,
          color: COLORS.white,
          alignment: AlignmentType.RIGHT
        }), right, {
          fill: COLORS.navy,
          borderColor: COLORS.navy,
          marginTop: scaled(110, layout, 45, 'rowScale'),
          marginBottom: scaled(110, layout, 45, 'rowScale')
        })
      ]
    })
  ];
  return fixedTable(width, [left, right], rows);
}

function paymentTable(bill, width, layout) {
  const innerWidth = width - 420;
  const left = Math.round(innerWidth * 0.68);
  const right = innerWidth - left;
  const fullRow = (label, value) => new TableRow({
    cantSplit: true,
    children: [
      cell(labelValue(label, value, {
        labelSize: scaled(13, layout, 10),
        valueSize: scaled(16, layout, 11),
        bold: false,
        valueColor: COLORS.navy,
        line: scaled(260, layout, 165)
      }), innerWidth, {
        borderless: true,
        columnSpan: 2,
        marginTop: scaled(70, layout, 25),
        marginBottom: scaled(70, layout, 25),
        marginLeft: 0,
        marginRight: 0
      })
    ]
  });
  const innerRows = [
    new TableRow({
      cantSplit: true,
      children: [
        cell(labelValue('Beneficiario', bill.proprietario, {
          labelSize: scaled(13, layout, 10),
          valueSize: scaled(16, layout, 11),
          line: scaled(260, layout, 165)
        }), left, {
          borderless: true,
          marginTop: scaled(70, layout, 25),
          marginBottom: scaled(70, layout, 25),
          marginLeft: 0
        }),
        cell(labelValue('Scadenza', bill.scadenza, {
          labelSize: scaled(13, layout, 10),
          valueSize: scaled(16, layout, 11),
          line: scaled(260, layout, 165)
        }), right, {
          borderless: true,
          marginTop: scaled(70, layout, 25),
          marginBottom: scaled(70, layout, 25),
          marginRight: 0
        })
      ]
    }),
    fullRow('IBAN del beneficiario', bill.iban || 'Non presente nella scheda del proprietario'),
    ...(bill.banca ? [fullRow('Banca', bill.banca)] : []),
    fullRow('Causale', bill.causale),
    ...(bill.pagamento ? [fullRow('Istruzioni aggiuntive', bill.pagamento)] : [])
  ];

  return fixedTable(width, [width], [
    new TableRow({
      cantSplit: true,
      children: [
        cell([
          paragraph('MODALITÀ DI PAGAMENTO', {
            size: scaled(17, layout, 12),
            bold: true,
            color: COLORS.navy,
            after: scaled(65, layout, 25)
          }),
          fixedTable(innerWidth, [left, right], innerRows, { borderless: true })
        ], width, {
          fill: COLORS.soft,
          marginTop: scaled(145, layout, 55),
          marginBottom: scaled(145, layout, 55),
          marginLeft: 210,
          marginRight: 210
        })
      ]
    })
  ]);
}

function noteTable(bill, width, layout) {
  if (!bill.nota) return null;
  const labelWidth = Math.round(width * 0.18);
  return fixedTable(width, [labelWidth, width - labelWidth], [
    new TableRow({
      cantSplit: true,
      children: [
        cell(paragraph('NOTE', {
          size: scaled(15, layout, 10),
          bold: true,
          color: COLORS.teal,
          line: scaled(240, layout, 155)
        }), labelWidth, {
          marginTop: scaled(110, layout, 40),
          marginBottom: scaled(110, layout, 40)
        }),
        cell(paragraph(bill.nota, {
          size: scaled(15, layout, 10),
          color: COLORS.text,
          line: scaled(240, layout, 155)
        }), width - labelWidth, {
          marginTop: scaled(110, layout, 40),
          marginBottom: scaled(110, layout, 40)
        })
      ]
    })
  ]);
}

function signatureTable(width, studio, layout) {
  const signature = dataUrlImage(studio.firmaImmagine);
  const signatureText = safeText(studio.firmaTesto || studio.referente);
  const signatureContent = signature
    ? paragraph([new ImageRun({
      data: signature.data,
      type: signature.type,
      transformation: {
        width: scaled(150, layout, 105),
        height: scaled(43, layout, 30)
      }
    })], { alignment: AlignmentType.CENTER, after: scaled(20, layout, 8) })
    : paragraph(signatureText || '', {
      size: scaled(18, layout, 12),
      bold: true,
      color: COLORS.navy,
      alignment: AlignmentType.CENTER,
      after: scaled(25, layout, 8)
    });
  return fixedTable(width, [width], [
    new TableRow({
      cantSplit: true,
      children: [
        cell([
          signatureContent,
          paragraph(signature && signatureText ? signatureText : 'Firma', {
            size: scaled(14, layout, 10),
            color: COLORS.muted,
            alignment: AlignmentType.CENTER,
            before: scaled(35, layout, 12)
          })
        ], width, {
          borders: topBorder(),
          marginTop: scaled(40, layout, 15),
          marginBottom: 0,
          marginLeft: 0,
          marginRight: 0
        })
      ]
    })
  ], { borderless: true });
}

function closingTable(bill, studio, width, layout) {
  const left = Math.round(width * 0.52);
  const right = width - left;
  return fixedTable(width, [left, right], [
    new TableRow({
      cantSplit: true,
      children: [
        cell([
          paragraph('DATA', {
            size: scaled(14, layout, 10),
            bold: true,
            color: COLORS.teal,
            after: scaled(35, layout, 15)
          }),
          paragraph(bill.emissione, {
            size: scaled(16, layout, 11),
            color: COLORS.navy
          })
        ], left, { borderless: true, marginLeft: 0, marginBottom: 0 }),
        cell([
          paragraph('', {
            line: scaled(180, layout, 65),
            after: scaled(170, layout, 50)
          }),
          signatureTable(right, studio, layout)
        ], right, {
          borderless: true,
          marginLeft: 250,
          marginRight: 0,
          marginBottom: 0,
          marginTop: scaled(110, layout, 35)
        })
      ]
    })
  ], { borderless: true });
}

function billElements(bill, studio, width, index) {
  const layout = billLayout(bill);
  const elements = [];
  if (index > 0) elements.push(new Paragraph({ children: [new PageBreak()] }));
  elements.push(
    headerTable(studio, width, layout),
    tableSpacer(7, layout),
    recipientTable(bill, width, layout),
    tableSpacer(6, layout),
    infoTable(bill, width, layout),
    tableSpacer(6, layout),
    financialTable(bill, width, layout),
    tableSpacer(6, layout),
    paymentTable(bill, width, layout)
  );
  const note = noteTable(bill, width, layout);
  if (note) elements.push(tableSpacer(4, layout), note);
  elements.push(
    tableSpacer(5, layout),
    closingTable(bill, studio, width, layout)
  );
  return elements;
}

async function createBillsDocument(payload = {}, settings = {}) {
  const marginMm = Math.min(30, Math.max(8, Number(settings.margins) || 14));
  const margin = mmToTwip(marginMm);
  const usableWidth = A4_WIDTH - (margin * 2);
  const studio = payload.studio || {};
  const bills = Array.isArray(payload.bills) ? payload.bills : [];
  if (!bills.length) throw new Error('Nessuna bolletta disponibile per il documento Word.');

  const children = bills.flatMap((bill, index) => billElements(bill, studio, usableWidth, index));
  const doc = new Document({
    creator: 'LOCA PRO',
    title: 'Bollette di locazione',
    subject: 'Documento gestionale LOCA PRO',
    description: 'Bollette di locazione generate da LOCA PRO',
    styles: {
      default: {
        document: {
          run: { font: 'Arial', size: 18, color: COLORS.text },
          paragraph: { spacing: { after: 0, line: 240 } }
        }
      }
    },
    sections: [{
      properties: {
        page: {
          size: { width: A4_WIDTH, height: A4_HEIGHT },
          margin: {
            top: margin,
            right: margin,
            bottom: margin,
            left: margin,
            header: mmToTwip(6),
            footer: mmToTwip(6),
            gutter: 0
          }
        }
      },
      children
    }]
  });
  return Packer.toBuffer(doc);
}

module.exports = {
  createBillsDocument
};
