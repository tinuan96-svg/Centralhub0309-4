const fs = require('fs');
const spec = JSON.parse(fs.readFileSync('openapi-spec.json', 'utf8'));

const tables = spec.definitions;
const schema = {};

for (const tableName in tables) {
  const table = tables[tableName];
  schema[tableName] = {
    columns: {}
  };
  for (const colName in table.properties) {
    const col = table.properties[colName];
    schema[tableName].columns[colName] = {
      type: col.type,
      format: col.format,
      description: col.description,
      nullable: col.nullable || false
    };
  }
}

fs.writeFileSync('extracted-schema.json', JSON.stringify(schema, null, 2));
console.log('Extracted schema saved to extracted-schema.json');
