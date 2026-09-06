import * as fs from 'fs';
import * as readline from 'readline';

async function analyzeSql(filePath: string) {
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const skuMap = new Map<string, any[]>();
  const gtinMap = new Map<string, any[]>();
  const nameMap = new Map<string, any[]>();
  const idMap = new Map<string, any[]>();

  let rowCount = 0;

  for await (const line of rl) {
    const trimmedLine = line.trim();
    if (trimmedLine.toLowerCase().startsWith('insert into "public"."products"') ||
        trimmedLine.toLowerCase().startsWith('insert into public.products')) {
      // This is a bit tricky because one INSERT can have multiple rows in VALUES
      // For simplicity, let's try to extract the VALUES part
      const valuesIndex = trimmedLine.toUpperCase().indexOf('VALUES');
      if (valuesIndex === -1) continue;

      let valuesStr = trimmedLine.substring(valuesIndex + 6).trim();
      if (valuesStr.endsWith(';')) valuesStr = valuesStr.substring(0, valuesStr.length - 1);
      // Split by '), (' to get individual rows
      // Note: this might fail if strings contain '), (' but usually it's safe for SQL exports
      const rows = valuesStr.split(/\), \(/);

      rows.forEach(row => {
        rowCount++;
        // Clean up row string
        let cleanedRow = row;
        if (cleanedRow.startsWith('(')) cleanedRow = cleanedRow.substring(1);
        if (cleanedRow.endsWith(')')) cleanedRow = cleanedRow.substring(0, cleanedRow.length - 1);

        // Split by comma, but be careful with strings
        // A better way is to use a regex that handles single quoted strings
        const parts: string[] = [];
        let current = '';
        let inString = false;
        for (let i = 0; i < cleanedRow.length; i++) {
          const char = cleanedRow[i];
          if (char === "'" && (i === 0 || cleanedRow[i-1] !== '\\')) {
            inString = !inString;
            current += char;
          } else if (char === ',' && !inString) {
            parts.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        parts.push(current.trim());

        // Based on the sample:
        // 0: id
        // 1: name
        // 21: sku
        // 26: gtin

        const id = parts[0]?.replace(/'/g, '');
        const name = parts[1]?.replace(/'/g, '');
        const sku = parts[21]?.replace(/'/g, '');
        const gtin = parts[26]?.replace(/'/g, '');

        if (id) {
          const list = idMap.get(id) || [];
          list.push({ name, sku, gtin });
          idMap.set(id, list);
        }
        if (sku && sku !== 'NULL' && sku !== '') {
          const list = skuMap.get(sku) || [];
          list.push({ id, name, gtin });
          skuMap.set(sku, list);
        }
        if (gtin && gtin !== 'NULL' && gtin !== '') {
          const list = gtinMap.get(gtin) || [];
          list.push({ id, name, sku });
          gtinMap.set(gtin, list);
        }
        if (name) {
            const normalizedName = name.toLowerCase();
            const list = nameMap.get(normalizedName) || [];
            list.push({ id, sku, gtin });
            nameMap.set(normalizedName, list);
        }
      });
    }
  }

  console.log(`Processed ${rowCount} product records from SQL.\n`);

  console.log("--- Duplicate IDs ---");
  let idDupCount = 0;
  idMap.forEach((list, id) => {
    if (list.length > 1) {
      idDupCount++;
      console.log(`ID: ${id} (${list.length} occurrences)`);
      list.forEach(p => console.log(`  - Name: ${p.name}`));
    }
  });
  if (idDupCount === 0) console.log("None\n");

  console.log("--- Duplicate SKUs ---");
  let skuDupCount = 0;
  skuMap.forEach((list, sku) => {
    if (list.length > 1) {
      skuDupCount++;
      console.log(`SKU: ${sku} (${list.length} occurrences)`);
      list.forEach(p => console.log(`  - ID: ${p.id}, Name: ${p.name}`));
    }
  });
  if (skuDupCount === 0) console.log("None\n");

  console.log("--- Duplicate GTINs ---");
  let gtinDupCount = 0;
  gtinMap.forEach((list, gtin) => {
    if (list.length > 1) {
      gtinDupCount++;
      console.log(`GTIN: ${gtin} (${list.length} occurrences)`);
      list.forEach(p => console.log(`  - ID: ${p.id}, Name: ${p.name}`));
    }
  });
  if (gtinDupCount === 0) console.log("None\n");

}

const sqlPath = 'C:/Users/sruth/Downloads/products_rows (3).sql';
analyzeSql(sqlPath).catch(console.error);
