import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const root = process.cwd();
const fixturePath = resolve(root, "packages/infrastructure/test/fixtures/repository-parity.json");
const contractsPath = resolve(root, "packages/infrastructure/src/desktop/tauri-contracts.ts");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
const sourceText = readFileSync(contractsPath, "utf8");
const source = ts.createSourceFile(
  contractsPath,
  sourceText,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);

const schemaByFixtureField = {
  structuredBlock: "StructuredBlockDtoSchema",
  searchDocument: "SearchDocumentDtoSchema",
  saveJournalSnapshot: "SaveJournalSnapshotDtoSchema",
  savedJournalSnapshot: "SavedJournalSnapshotDtoSchema",
  journal: "JournalDtoSchema",
  journalSaveState: "JournalSaveStateDtoSchema",
  journalVersion: "JournalVersionDtoSchema",
  journalVersionSummary: "JournalVersionSummaryDtoSchema",
  storageError: "StorageErrorDtoSchema",
};

function propertyName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) {
    return node.text;
  }
  throw new Error(`Unsupported object field name: ${node.getText(source)}`);
}

function findObjectLiteral(schemaName) {
  let result;

  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === schemaName
    ) {
      if (!node.initializer || !ts.isCallExpression(node.initializer)) {
        throw new Error(`${schemaName} must be initialized by a z.object(...) call`);
      }
      const objectArgument = node.initializer.arguments[0];
      if (!objectArgument || !ts.isObjectLiteralExpression(objectArgument)) {
        throw new Error(`${schemaName} must pass an object literal to z.object(...)`);
      }
      result = objectArgument;
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  if (!result) {
    throw new Error(`Could not find ${schemaName} in ${contractsPath}`);
  }
  return result;
}

function schemaFields(schemaName) {
  return findObjectLiteral(schemaName)
    .properties.map((property) => {
      if (!ts.isPropertyAssignment(property)) {
        throw new Error(`${schemaName} contains a non-assignment field`);
      }
      return propertyName(property.name);
    })
    .sort();
}

const errors = [];
for (const [fixtureField, schemaName] of Object.entries(schemaByFixtureField)) {
  const expected = [...fixture.dtoFields[fixtureField]].sort();
  const actual = schemaFields(schemaName);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    const missing = expected.filter((field) => !actual.includes(field));
    const extra = actual.filter((field) => !expected.includes(field));
    errors.push(`${schemaName}: missing [${missing.join(", ")}], extra [${extra.join(", ")}]`);
  }
}

if (errors.length > 0) {
  process.stderr.write("DTO fixture field mismatch:\n");
  for (const error of errors) {
    process.stderr.write(`- ${error}\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Validated ${Object.keys(schemaByFixtureField).length} DTO field sets against the shared fixture.\n`,
  );
}
