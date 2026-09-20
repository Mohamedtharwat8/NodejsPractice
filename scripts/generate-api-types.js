const fs = require("node:fs");
const path = require("node:path");
const { buildSpec } = require("../src/docs/openapi");

const spec = buildSpec();
const schemas = spec.components?.schemas || {};
function typeOf(schema = {}) {
  if (schema.$ref) return schema.$ref.split("/").at(-1);
  if (schema.enum) return schema.enum.map((value) => JSON.stringify(value)).join(" | ");
  if (schema.oneOf) return schema.oneOf.map(typeOf).join(" | ");
  if (schema.allOf) return schema.allOf.map(typeOf).join(" & ");
  if (schema.type === "array") return `Array<${typeOf(schema.items)}>`;
  if (schema.type === "integer" || schema.type === "number") return "number";
  if (schema.type === "boolean") return "boolean";
  if (schema.type === "object" || schema.properties) {
    const required = new Set(schema.required || []);
    return `{\n${Object.entries(schema.properties || {}).map(([name, value]) => `  ${JSON.stringify(name)}${required.has(name) ? "" : "?"}: ${typeOf(value)};`).join("\n")}\n}`;
  }
  return "string";
}
const names = Object.keys(schemas).sort();
const paths = Object.keys(spec.paths).sort();
const output = ["// Generated from the API OpenAPI document. Do not edit by hand.", "/* eslint-disable */", ...names.map((name) => `export type ${name} = ${typeOf(schemas[name])};`), `export type ApiPath = ${paths.map((item) => JSON.stringify(item)).join(" | ")};`, ""].join("\n\n");
const target = path.join(__dirname, "..", "client", "src", "app", "core", "api.generated.ts");
fs.writeFileSync(target, output);
console.log(`Generated ${names.length} schemas and ${paths.length} paths -> ${path.relative(process.cwd(), target)}`);
