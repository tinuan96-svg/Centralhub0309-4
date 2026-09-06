import * as XLSX from 'xlsx';
import * as fs from 'fs';

const filePath = "C:/Users/sruth/Downloads/Stock-Price List 15 June 2026.xlsx";

try {
    const fileBuffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Get headers (first row)
    const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    const output = {
        fileName: "Stock-Price List 15 June 2026.xlsx",
        sheetName,
        rowCount: data.length,
        headers: data[0] || [],
        row1: data[1] || [],
        row2: data[2] || [],
        row3: data[3] || []
    };

    console.log(JSON.stringify(output, null, 2));
} catch (err: any) {
    console.log(JSON.stringify({ error: err.message }, null, 2));
}
