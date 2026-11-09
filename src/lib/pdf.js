// Build an image PDF with an invisible, searchable text layer.
// The text uses Tesseract's tiny "GlyphLessFont" (every CID is a blank glyph, ToUnicode maps CID = UTF-16 code
// unit), so any language works without embedding a large CJK font.
import {
  PDFDocument, PDFHexString, PDFName, PDFString, TextRenderingMode,
  beginText, endText, setFontAndSize, setTextMatrix, setTextRenderingMode, showText,
} from 'pdf-lib';

const A4_PT = { w: 595.28, h: 841.89 };
const GLYPH_WIDTH = 500; // DW in 1/1000 em

const TO_UNICODE = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Adobe-Identity-UCS def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
1 beginbfrange
<0000> <FFFF> <0000>
endbfrange
endcmap
CMapName currentdict /CMap defineresource pop
end
end
`;

function addGlyphlessFont(pdf, ttfBytes) {
  const ctx = pdf.context;
  const fontFile = ctx.register(ctx.flateStream(ttfBytes, { Length1: ttfBytes.length }));
  const gidMap = new Uint8Array(65536 * 2);
  for (let i = 1; i < gidMap.length; i += 2) gidMap[i] = 1; // every CID -> glyph 1
  const cidToGid = ctx.register(ctx.flateStream(gidMap));
  const toUnicode = ctx.register(ctx.flateStream(new TextEncoder().encode(TO_UNICODE)));
  const descriptor = ctx.register(ctx.obj({
    Type: 'FontDescriptor', FontName: 'GlyphLessFont', Flags: 5, FontBBox: [0, 0, GLYPH_WIDTH, 1000],
    ItalicAngle: 0, Ascent: 1000, Descent: 0, CapHeight: 1000, StemV: 80, FontFile2: fontFile,
  }));
  const cidFont = ctx.register(ctx.obj({
    Type: 'Font', Subtype: 'CIDFontType2', BaseFont: 'GlyphLessFont',
    CIDSystemInfo: ctx.obj({ Registry: PDFString.of('Adobe'), Ordering: PDFString.of('Identity'), Supplement: 0 }),
    FontDescriptor: descriptor, DW: GLYPH_WIDTH, CIDToGIDMap: cidToGid,
  }));
  return ctx.register(ctx.obj({
    Type: 'Font', Subtype: 'Type0', BaseFont: 'GlyphLessFont', Encoding: 'Identity-H',
    DescendantFonts: [cidFont], ToUnicode: toUnicode,
  }));
}

function utf16Hex(text) {
  let hex = '';
  for (let i = 0; i < text.length; i++) hex += text.charCodeAt(i).toString(16).padStart(4, '0');
  return hex;
}

/**
 * @param {Blob} jpeg page image (JPEG)
 * @param {{w:number,h:number}} imgSize page image pixel size
 * @param {{text:string,x0:number,y0:number,x1:number,y1:number}[]} items boxes in image pixels
 * @param {Uint8Array} glyphlessTtf
 * @param {{title?:string}} meta
 * @returns {Promise<Uint8Array>}
 */
export async function buildPdf(jpeg, imgSize, items, glyphlessTtf, meta = {}) {
  const landscape = imgSize.w > imgSize.h;
  const pw = landscape ? A4_PT.h : A4_PT.w, ph = landscape ? A4_PT.w : A4_PT.h;

  const pdf = await PDFDocument.create();
  pdf.setTitle(meta.title || 'scan');
  pdf.setProducer('scan2pdf');
  pdf.setCreator('scan2pdf');
  const page = pdf.addPage([pw, ph]);
  const img = await pdf.embedJpg(new Uint8Array(await jpeg.arrayBuffer()));
  page.drawImage(img, { x: 0, y: 0, width: pw, height: ph });

  const fontRef = addGlyphlessFont(pdf, glyphlessTtf);
  const fontName = 'FGlyphLess';
  page.node.setFontDictionary(PDFName.of(fontName), fontRef);

  const k = pw / imgSize.w;
  const ordered = [...items]
    .filter((it) => it.text && it.text.trim())
    .sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2 || a.x0 - b.x0);
  const ops = [];
  for (const it of ordered) {
    const text = it.text.replace(/\s+/g, ' ').trim();
    const size = Math.max(1, (it.y1 - it.y0) * k);
    const width = Math.max(1, (it.x1 - it.x0) * k);
    const hscale = width / (text.length * size * (GLYPH_WIDTH / 1000));
    ops.push(
      beginText(),
      setTextRenderingMode(TextRenderingMode.Invisible),
      setFontAndSize(fontName, size),
      setTextMatrix(hscale, 0, 0, 1, it.x0 * k, ph - it.y1 * k),
      showText(PDFHexString.of(utf16Hex(text))),
      endText(),
    );
  }
  page.pushOperators(...ops);
  return pdf.save();
}
