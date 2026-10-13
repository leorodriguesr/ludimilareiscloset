import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { isSizeOnlyColorName, isSizeOnlyPiece } from "@/lib/piece-size-only-color";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const HEADER_H = 36;
const IMAGE_W = 126;
const IMAGE_H = 168;

const INK = rgb(0.16, 0.14, 0.13);
const MUTED = rgb(0.4, 0.38, 0.36);
const LINE = rgb(0.78, 0.75, 0.72);
const HEAD = rgb(0.96, 0.94, 0.92);

type SheetPiece = {
  name: string;
  sizeOnly: boolean;
  sizes: string[];
  colors: string[];
};

type SheetProduct = {
  name: string;
  image: PDFImage | null;
  pieces: SheetPiece[];
};

function pdfText(value: string): string {
  return value
    .replace(/\u2014|\u2013/g, "-")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^\u0020-\u00ff]/g, "");
}

function jpegCoverUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("cloudinary.com")) return url;
    const marker = "/image/upload/";
    const index = parsed.pathname.indexOf(marker);
    if (index === -1) return url;
    const transform = `f_jpg,q_auto:good,c_fill,g_auto,w_480,h_640`;
    parsed.pathname = `${parsed.pathname.slice(0, index + marker.length)}${transform}/${parsed.pathname.slice(index + marker.length)}`;
    return parsed.toString();
  } catch {
    return url;
  }
}

async function loadCover(doc: PDFDocument, url: string | null): Promise<PDFImage | null> {
  if (!url) return null;
  try {
    const response = await fetch(jpegCoverUrl(url), {
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    try {
      return await doc.embedJpg(bytes);
    } catch {
      return await doc.embedPng(bytes);
    }
  } catch {
    return null;
  }
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = pdfText(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = word;
  }
  if (line) lines.push(line);
  return lines;
}

function fitText(text: string, font: PDFFont, size: number, maxWidth: number): string {
  const value = pdfText(text);
  if (font.widthOfTextAtSize(value, size) <= maxWidth) return value;
  let cut = value;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, size) > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}...`;
}

type Cursor = { page: PDFPage; y: number };

function contentTop(): number {
  return PAGE_H - MARGIN - HEADER_H;
}

function paintPageHeader(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  dateLabel: string
) {
  page.drawText("Contagem de estoque", {
    x: MARGIN,
    y: PAGE_H - MARGIN - 4,
    size: 14,
    font: fontBold,
    color: INK,
  });
  const dateWidth = font.widthOfTextAtSize(dateLabel, 9);
  page.drawText(dateLabel, {
    x: PAGE_W - MARGIN - dateWidth,
    y: PAGE_H - MARGIN - 2,
    size: 9,
    font,
    color: MUTED,
  });
  page.drawLine({
    start: { x: MARGIN, y: PAGE_H - MARGIN - 16 },
    end: { x: PAGE_W - MARGIN, y: PAGE_H - MARGIN - 16 },
    thickness: 0.6,
    color: LINE,
  });
}

function newPage(
  doc: PDFDocument,
  font: PDFFont,
  fontBold: PDFFont,
  dateLabel: string
): Cursor {
  const page = doc.addPage([PAGE_W, PAGE_H]);
  paintPageHeader(page, font, fontBold, dateLabel);
  return { page, y: contentTop() };
}

function ensure(
  doc: PDFDocument,
  cursor: Cursor,
  height: number,
  font: PDFFont,
  fontBold: PDFFont,
  dateLabel: string
): Cursor {
  if (cursor.y - height >= MARGIN) return cursor;
  return newPage(doc, font, fontBold, dateLabel);
}

function drawCell(
  page: PDFPage,
  x: number,
  top: number,
  width: number,
  height: number,
  label: string,
  font: PDFFont,
  header: boolean
) {
  page.drawRectangle({
    x,
    y: top - height,
    width,
    height,
    borderColor: LINE,
    borderWidth: 0.7,
    color: header ? HEAD : rgb(1, 1, 1),
  });
  if (!label) return;
  const size = header ? 8 : 9;
  const text = fitText(label, font, size, width - 8);
  const textWidth = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: x + (width - textWidth) / 2,
    y: top - height + (height - size) / 2,
    size,
    font,
    color: INK,
  });
}

function drawMatrix(
  doc: PDFDocument,
  cursor: Cursor,
  piece: SheetPiece,
  font: PDFFont,
  fontBold: PDFFont,
  dateLabel: string
): Cursor {
  const rowH = 26;
  const columns = piece.sizeOnly ? ["Quantidade"] : piece.colors;
  const rows = piece.sizes;
  const labelW = 88;
  const usable = PAGE_W - MARGIN * 2 - labelW;
  const colW = Math.min(72, usable / Math.max(columns.length, 1));

  let current = cursor;
  if (piece.name) {
    current = ensure(doc, current, 18, font, fontBold, dateLabel);
    current.page.drawText(pdfText(piece.name), {
      x: MARGIN,
      y: current.y - 12,
      size: 10,
      font: fontBold,
      color: INK,
    });
    current = { page: current.page, y: current.y - 18 };
  }

  const header = "Tamanho";

  const drawHeader = (at: Cursor): Cursor => {
    const next = ensure(doc, at, rowH, font, fontBold, dateLabel);
    drawCell(next.page, MARGIN, next.y, labelW, rowH, header, fontBold, true);
    columns.forEach((column, index) => {
      drawCell(
        next.page,
        MARGIN + labelW + colW * index,
        next.y,
        colW,
        rowH,
        column,
        fontBold,
        true
      );
    });
    return { page: next.page, y: next.y - rowH };
  };

  current = drawHeader(current);
  for (const row of rows) {
    if (current.y - rowH < MARGIN) {
      current = drawHeader(newPage(doc, font, fontBold, dateLabel));
    }
    drawCell(
      current.page,
      MARGIN,
      current.y,
      labelW,
      rowH,
      row,
      font,
      false
    );
    columns.forEach((_, index) => {
      drawCell(
        current.page,
        MARGIN + labelW + colW * index,
        current.y,
        colW,
        rowH,
        "",
        font,
        false
      );
    });
    current = { page: current.page, y: current.y - rowH };
  }

  return { page: current.page, y: current.y - 14 };
}

function drawProduct(
  doc: PDFDocument,
  cursor: Cursor,
  product: SheetProduct,
  font: PDFFont,
  fontBold: PDFFont,
  dateLabel: string
): Cursor {
  let current = ensure(doc, cursor, IMAGE_H + 18, font, fontBold, dateLabel);
  const top = current.y;

  if (product.image) {
    current.page.drawImage(product.image, {
      x: MARGIN,
      y: top - IMAGE_H,
      width: IMAGE_W,
      height: IMAGE_H,
    });
  } else {
    current.page.drawRectangle({
      x: MARGIN,
      y: top - IMAGE_H,
      width: IMAGE_W,
      height: IMAGE_H,
      color: HEAD,
      borderColor: LINE,
      borderWidth: 0.7,
    });
    const missing = "Sem foto";
    const size = 9;
    const width = font.widthOfTextAtSize(missing, size);
    current.page.drawText(missing, {
      x: MARGIN + (IMAGE_W - width) / 2,
      y: top - IMAGE_H / 2,
      size,
      font,
      color: MUTED,
    });
  }

  const textX = MARGIN + IMAGE_W + 16;
  const textW = PAGE_W - MARGIN - textX;
  const lines = wrapText(product.name, fontBold, 16, textW).slice(0, 4);
  lines.forEach((line, index) => {
    current.page.drawText(line, {
      x: textX,
      y: top - 22 - index * 20,
      size: 16,
      font: fontBold,
      color: INK,
    });
  });
  current.page.drawText("Anote só a quantidade.", {
    x: textX,
    y: top - IMAGE_H + 8,
    size: 9,
    font,
    color: MUTED,
  });

  current = { page: current.page, y: top - IMAGE_H - 16 };

  if (product.pieces.length === 0) {
    current = ensure(doc, current, 16, font, fontBold, dateLabel);
    current.page.drawText("Sem tamanhos e cores cadastrados.", {
      x: MARGIN,
      y: current.y - 12,
      size: 10,
      font,
      color: MUTED,
    });
    current = { page: current.page, y: current.y - 28 };
  }

  for (const piece of product.pieces) {
    current = drawMatrix(doc, current, piece, font, fontBold, dateLabel);
  }

  return { page: current.page, y: current.y - 8 };
}

export async function buildStockCountSheet(): Promise<{
  bytes: Uint8Array;
  filename: string;
}> {
  const products = await prisma.product.findMany({
    orderBy: { name: "asc" },
    include: {
      images: { orderBy: { order: "asc" }, take: 1 },
      pieces: {
        orderBy: { id: "asc" },
        include: {
          colors: { orderBy: { id: "asc" } },
          sizes: { orderBy: { id: "asc" } },
        },
      },
    },
  });

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const dateLabel = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());

  const covers = await Promise.all(
    products.map((product) => loadCover(doc, product.images[0]?.url ?? null))
  );

  const sheets: SheetProduct[] = products.map((product, index) => ({
    name: product.name,
    image: covers[index] ?? null,
    pieces: product.pieces.map((piece) => {
      const sizeOnly = isSizeOnlyPiece(piece);
      const colors = piece.colors
        .map((color) => color.name.trim())
        .filter((name) => name && !isSizeOnlyColorName(name));
      const sizes = piece.sizes.map((size) => size.name.trim()).filter(Boolean);
      const onlySize = sizeOnly || (sizes.length > 0 && colors.length === 0);
      if (!onlySize && (sizes.length === 0 || colors.length === 0)) return null;
      if (onlySize && sizes.length === 0) return null;
      return {
        name: product.pieces.length > 1 ? piece.name.trim() : "",
        sizeOnly: onlySize,
        sizes,
        colors: onlySize ? [] : colors,
      };
    }).filter((piece): piece is SheetPiece => piece != null),
  }));

  let cursor = newPage(doc, font, fontBold, dateLabel);
  if (sheets.length === 0) {
    cursor.page.drawText("Nenhum produto cadastrado.", {
      x: MARGIN,
      y: cursor.y - 20,
      size: 12,
      font,
      color: MUTED,
    });
  } else {
    for (const product of sheets) {
      cursor = drawProduct(doc, cursor, product, font, fontBold, dateLabel);
    }
  }

  const pages = doc.getPages();
  pages.forEach((page, index) => {
    const label = `${index + 1} / ${pages.length}`;
    const width = font.widthOfTextAtSize(label, 8);
    page.drawText(label, {
      x: PAGE_W - MARGIN - width,
      y: 22,
      size: 8,
      font,
      color: MUTED,
    });
  });

  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return {
    bytes: await doc.save(),
    filename: `contagem-estoque-${iso}.pdf`,
  };
}
