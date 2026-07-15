import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { isExcelFilename, parseContactWorkbook } from './parse-contact-workbook';

async function buildWorkbook(rows: (string | number)[][]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Contacts');
  for (const row of rows) ws.addRow(row);
  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}

describe('isExcelFilename', () => {
  it('accepts .xlsx (any case)', () => {
    expect(isExcelFilename('contacts.xlsx')).toBe(true);
    expect(isExcelFilename('CONTACTS.XLSX')).toBe(true);
  });

  it('rejects .csv and legacy .xls', () => {
    expect(isExcelFilename('contacts.csv')).toBe(false);
    expect(isExcelFilename('contacts.xls')).toBe(false);
  });
});

describe('parseContactWorkbook', () => {
  it('parses phone/name/email/company/tags from the first sheet', async () => {
    const data = await buildWorkbook([
      ['phone', 'name', 'email', 'company', 'tags'],
      ['+15551234567', 'Alice', 'alice@example.com', 'Acme', 'VIP, Lead'],
      ['+15559876543', 'Bob', '', '', ''],
    ]);

    expect(await parseContactWorkbook(data)).toEqual({
      hasTagsColumn: true,
      hasCompanyColumn: true,
      rows: [
        {
          phone: '+15551234567',
          name: 'Alice',
          email: 'alice@example.com',
          company: 'Acme',
          tagNames: ['VIP', 'Lead'],
        },
        {
          phone: '+15559876543',
          name: 'Bob',
          email: undefined,
          company: undefined,
          tagNames: [],
        },
      ],
    });
  });

  it('stringifies numeric phone cells without mangling', async () => {
    const data = await buildWorkbook([
      ['phone', 'name'],
      [919876543210, 'Numeric'],
    ]);

    const { rows } = await parseContactWorkbook(data);
    expect(rows).toHaveLength(1);
    expect(rows[0].phone).toBe('919876543210');
  });

  it('skips rows without a phone value', async () => {
    const data = await buildWorkbook([
      ['phone', 'name'],
      ['', 'NoPhone'],
      ['+15551112222', 'HasPhone'],
    ]);

    const { rows } = await parseContactWorkbook(data);
    expect(rows.map((r) => r.name)).toEqual(['HasPhone']);
  });

  it('returns no rows when the phone header is missing', async () => {
    const data = await buildWorkbook([
      ['name', 'email'],
      ['Alice', 'alice@example.com'],
    ]);

    expect(await parseContactWorkbook(data)).toEqual({
      rows: [],
      hasTagsColumn: false,
      hasCompanyColumn: false,
    });
  });

  it('returns no rows for an empty workbook', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Empty');
    const data = (await wb.xlsx.writeBuffer()) as ArrayBuffer;

    expect(await parseContactWorkbook(data)).toEqual({
      rows: [],
      hasTagsColumn: false,
      hasCompanyColumn: false,
    });
  });
});
