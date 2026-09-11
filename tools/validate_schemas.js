/**
 * LinhSinhVN — Schema Validation Tool
 * 
 * Recursively scans data/ for JSON schema files, asserts valid JSON parsing,
 * and validates core JSON Schema structure.
 */

import fs from 'node:fs';
import path from 'node:path';

function findJsonFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      findJsonFiles(filePath, fileList);
    } else if (file.endsWith('.schema.json') || (filePath.includes(`${path.sep}schema${path.sep}`) && file.endsWith('.json'))) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const schemas = findJsonFiles('data');
console.log(`Found ${schemas.length} JSON schema files across data/ directory.`);

let errors = 0;

for (const schemaPath of schemas) {
  try {
    const content = fs.readFileSync(schemaPath, 'utf8');
    const parsed = JSON.parse(content);

    // Basic Draft-07 structural validation checks
    if (!parsed.$schema) {
      console.warn(`[WARN] ${schemaPath}: Missing $schema field`);
    }
    if (!parsed.type) {
      console.warn(`[WARN] ${schemaPath}: Missing type field`);
    }
    if (parsed.type === 'object' && !parsed.properties && !parsed.additionalProperties) {
      console.warn(`[WARN] ${schemaPath}: Object type without properties`);
    }

    console.log(`[PASS] ${schemaPath} parsed successfully (${parsed.title || 'Untitled'}).`);
  } catch (err) {
    console.error(`[FAIL] ${schemaPath}: ${err.message}`);
    errors++;
  }
}

if (errors > 0) {
  console.error(`\nValidation failed with ${errors} error(s).`);
  process.exit(1);
} else {
  console.log(`\nAll ${schemas.length} schemas verified valid!`);
  process.exit(0);
}
