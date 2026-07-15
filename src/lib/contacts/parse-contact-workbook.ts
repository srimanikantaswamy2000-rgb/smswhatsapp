/**
 * Excel (.xlsx) parsing for the contacts import modal. Converts the
 * first worksheet into a string-cell grid and reuses the same
 * `parseContactTable` core as the CSV path, so column handling and
 * cell cleanup stay identical across both formats.
 *
 * Legacy .xls (BIFF) is intentionally unsupported — exceljs only
 * reads the OOXML .xlsx container. The import modal surfaces a clear
 * error for .xls instead of failing opaquely.
 */

import ExcelJS from 'exceljs';

import {
  parseContactTable,
  type ParseContactCsvResult,
} from './parse-contact-csv';

/** True for filenames the workbook parser can read (.xlsx only). */
export function isExcelFilename(name: string): boolean {
  return /\.xlsx$/i.test(name);
}

export async function parseContactWorkbook(
  data: ArrayBuffer
): Promise<ParseContactCsvResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { rows: [], hasTagsColumn: false, hasCompanyColumn: false };
  }

  const table: string[][] = [];
  sheet.eachRow((row) => {
    const cells: string[] = [];
    for (let c = 1; c <= row.cellCount; c++) {
      // `.text` renders the displayed value — numbers, dates, rich
      // text and formula results all come back as strings, which is
      // exactly what the shared table parser expects.
      cells.push(row.getCell(c).text ?? '');
    }
    table.push(cells);
  });

  return parseContactTable(table);
}
