import * as XLSX from 'xlsx';
import * as fs from 'fs';

const filePath = "C:/Users/sruth/Downloads/Stock-Price List 15 June 2026.xlsx";

try {
    const fileBuffer = fs.readFileSync(filePath);
    // cellStyles: true is required to read styling information
    const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellStyles: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // In XLSX, styles are often stored in the cell object itself.
    // For example, sheet['A2'].s might contain the style.

    const rows: any[] = [];
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');

    for (let R = range.s.r; R <= Math.min(range.e.r, 20); ++R) {
        const rowData: any = { row: R + 1, cells: [] };
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
            const cell = sheet[cellRef];
            if (cell) {
                rowData.cells.push({
                    ref: cellRef,
                    val: cell.v,
                    style: cell.s ? JSON.stringify(cell.s) : 'no style'
                });
            }
        }
        rows.push(rowData);
    }

    console.log(JSON.stringify(rows, null, 2));
} catch (err: any) {
    console.log(JSON.stringify({ error: err.message }, null, 2));
}
