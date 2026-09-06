import * as fs from 'fs';

async function analyzeSql(filePath: string) {
    const content = fs.readFileSync(filePath, 'utf8');

    // Find the VALUES part
    const valuesIndex = content.indexOf('VALUES');
    if (valuesIndex === -1) {
        console.log("No VALUES found in SQL.");
        return;
    }

    const valuesPart = content.substring(valuesIndex + 6);

    const skuMap = new Map<string, any[]>();
    const gtinMap = new Map<string, any[]>();
    const nameMap = new Map<string, any[]>();
    const idMap = new Map<string, any[]>();

    let rowCount = 0;

    // Regex to match (id, name, ..., sku, ..., gtin, ...)
    // This is hard because of the number of columns and potential commas in strings.
    // Let's use a manual parser for the values part.

    let i = 0;
    while (i < valuesPart.length) {
        // Find next '('
        while (i < valuesPart.length && valuesPart[i] !== '(') i++;
        if (i >= valuesPart.length) break;
        i++; // skip '('

        const rowValues: string[] = [];
        let currentField = '';
        let inString = false;
        let parenLevel = 0;
        let inArray = false;

        while (i < valuesPart.length) {
            const char = valuesPart[i];

            if (char === "'" && (i === 0 || valuesPart[i-1] !== '\\')) {
                // Handle escaped quotes in SQL (usually '')
                if (inString && valuesPart[i+1] === "'") {
                    currentField += "'";
                    i++; // skip next '
                } else {
                    inString = !inString;
                }
                currentField += char;
            } else if (char === '[' && !inString) {
                inArray = true;
                currentField += char;
            } else if (char === ']' && !inString) {
                inArray = false;
                currentField += char;
            } else if (char === ',' && !inString && !inArray) {
                rowValues.push(currentField.trim());
                currentField = '';
            } else if (char === ')' && !inString && !inArray) {
                rowValues.push(currentField.trim());
                break;
            } else {
                currentField += char;
            }
            i++;
        }

        rowCount++;

        const id = rowValues[0]?.replace(/^'|'$/g, '').replace(/''/g, "'");
        const name = rowValues[1]?.replace(/^'|'$/g, '').replace(/''/g, "'");
        const brand = rowValues[8]?.replace(/^'|'$/g, '').replace(/''/g, "'");
        const weight = rowValues[11]?.replace(/^'|'$/g, '').replace(/''/g, "'");
        const unit = rowValues[12]?.replace(/^'|'$/g, '').replace(/''/g, "'");
        const sku = rowValues[21]?.replace(/^'|'$/g, '').replace(/''/g, "'");
        const gtin = rowValues[26]?.replace(/^'|'$/g, '').replace(/''/g, "'");
        const stock = parseInt(rowValues[18]) || 0;

        const businessKey = `${brand}|${name}|${weight} ${unit}`.toLowerCase();

        if (id) {
            const list = idMap.get(id) || [];
            list.push({ name, sku, gtin, brand, weight, unit, stock });
            idMap.set(id, list);

            const bList = nameMap.get(businessKey) || [];
            bList.push({ id, name, sku, gtin, brand, weight, unit, stock });
            nameMap.set(businessKey, bList);
        }

        // move to next record
        i++;
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

    console.log("--- True Duplicates (Same Brand, Name, and Weight) ---");
    let businessDupCount = 0;
    nameMap.forEach((list, key) => {
        if (list.length > 1) {
            businessDupCount++;
            console.log(`Key: "${key}" (${list.length} occurrences)`);
            list.forEach(p => console.log(`  - ID: ${p.id}, SKU: ${p.sku}, Stock: ${p.stock}`));
        }
    });
    console.log(`${businessDupCount} products have true duplicates based on brand, name, and weight.\n`);
}

const sqlPath = 'C:/Users/sruth/Downloads/products_rows (3).sql';
analyzeSql(sqlPath).catch(console.error);
