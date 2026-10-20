import * as fs from "fs";
import * as path from "path";

const SRC = path.join(__dirname, "..");
const TEXT_TYPES = new Set(["varchar", "text", "char"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

function entityTextProps(): Map<string, Map<string, string>> {
  const byEntity = new Map<string, Map<string, string>>();
  const dir = path.join(SRC, "database", "entities");
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".entity.ts"))) {
    const src = fs.readFileSync(path.join(dir, file), "utf8");
    const cls = /export class (\w+)/.exec(src);
    if (!cls) continue;
    const props = new Map<string, string>();
    const re = /@Column\(([^)]*)\)\s*\n\s*(\w+)[!?]?:/gs;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const type = /type:\s*"(\w+)"/.exec(m[1]);
      props.set(m[2], type ? type[1] : "varchar");
    }
    byEntity.set(cls[1], props);
  }
  return byEntity;
}

describe("repository search fields", () => {
  const entities = entityTextProps();
  const repos = walk(SRC).filter((f) => f.endsWith(".repository.ts"));

  it("finds repositories to check", () => {
    expect(repos.length).toBeGreaterThan(0);
  });

  it("only declares text columns that exist on the entity", () => {
    const problems: string[] = [];

    for (const file of repos) {
      const src = fs.readFileSync(file, "utf8");
      const entity = /super\((\w+),/.exec(src);
      const decl = /getSearchFields\(\)\s*:\s*string\[\]\s*\{\s*return\s*\[([^\]]*)\]/s.exec(src);
      if (!entity || !decl) continue;

      const props = entities.get(entity[1]);
      if (!props) continue;

      const fields = decl[1]
        .split(",")
        .map((f) => f.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);

      for (const field of fields) {
        const type = props.get(field);
        if (type === undefined) {
          problems.push(`${path.basename(file)}: ${entity[1]}.${field} does not exist`);
        } else if (!TEXT_TYPES.has(type)) {
          problems.push(
            `${path.basename(file)}: ${entity[1]}.${field} is ${type}, not text — ILIKE will fail`,
          );
        }
      }
    }

    expect(problems).toEqual([]);
  });
});
