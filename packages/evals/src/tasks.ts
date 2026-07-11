import type { ScriptedTurn } from "@mullion/agents/testing";
import { toolCall } from "@mullion/agents/testing";
import { OpenRouterError } from "@mullion/llm";

/**
 * The fixed evaluation suite (ADR-12, 02 §10.2): 16 idea specs of
 * increasing difficulty. FIXED means fixed — add nothing, remove nothing,
 * reword nothing without superseding ADR-12; the trend line is only a trend
 * if every version ran the same tasks.
 *
 * Each task carries:
 * - `idea` — the user-level prompt (the live Fork-A input once real creds
 *   run planning end-to-end).
 * - `nodes` — the frozen task graph the build phase executes.
 * - per-node runner-owned tests (ADR-48) and scripted coder transcripts, so
 *   `scripted` mode exercises the identical build path deterministically.
 * - `expected` — scripted-mode ground truth; a mismatch fails the eval run
 *   itself (the harness regressed, which is exactly what CI must catch).
 */

export interface EvalNodeFixture {
  taskId: string;
  description: string;
  acceptanceCriteria: string;
  dependsOn: string[];
  verifyCommand: string;
  testCommand: string;
  runnerTests: { path: string; content: string }[];
  /** One ScriptedLlm transcript per attempt; attempts past the end reuse the last. */
  scriptedAttempts: ScriptedTurn[][];
}

export interface EvalTaskFixture {
  id: string;
  title: string;
  /** 1 (trivial) → 5 (hardest) — the §10.2 difficulty ramp. */
  difficulty: 1 | 2 | 3 | 4 | 5;
  idea: string;
  nodes: EvalNodeFixture[];
  expected: "verified" | "failed";
}

const test = (path: string, content: string[]): { path: string; content: string } => ({
  path,
  content: content.join("\n"),
});

const write = (id: string, path: string, content: string): ScriptedTurn => ({
  toolCalls: [toolCall(id, "writeFile", { path, content })],
});
const submit = (id: string): ScriptedTurn => ({ toolCalls: [toolCall(id, "submit", {})] });

/** Single-node fixture where the scripted coder writes `files` then submits. */
function simpleNode(args: {
  taskId: string;
  description: string;
  acceptanceCriteria: string;
  files: { path: string; content: string }[];
  runnerTests: { path: string; content: string }[];
  testCommand: string;
  dependsOn?: string[];
}): EvalNodeFixture {
  return {
    taskId: args.taskId,
    description: args.description,
    acceptanceCriteria: args.acceptanceCriteria,
    dependsOn: args.dependsOn ?? [],
    verifyCommand: args.testCommand,
    testCommand: args.testCommand,
    runnerTests: args.runnerTests,
    scriptedAttempts: [
      [
        ...args.files.map((f, i) => write(`w${i}`, f.path, f.content)),
        submit("s0"),
      ],
    ],
  };
}

export const EVAL_TASKS: EvalTaskFixture[] = [
  {
    id: "e01-sum",
    title: "Sum function",
    difficulty: 1,
    idea: "A tiny math helper library exposing a sum function.",
    expected: "verified",
    nodes: [
      simpleNode({
        taskId: "t1",
        description: "Write sum.js exporting sum(a, b) returning a + b (CommonJS).",
        acceptanceCriteria: "require('./sum.js').sum(2, 3) === 5",
        files: [{ path: "sum.js", content: "exports.sum = (a, b) => a + b;" }],
        testCommand: "node --test sum.test.js",
        runnerTests: [
          test("sum.test.js", [
            "const { test } = require('node:test');",
            "const assert = require('node:assert');",
            "const { sum } = require('./sum.js');",
            "test('adds', () => assert.strictEqual(sum(2, 3), 5));",
            "test('negative', () => assert.strictEqual(sum(-2, 3), 1));",
          ]),
        ],
      }),
    ],
  },
  {
    id: "e02-strings",
    title: "String utilities",
    difficulty: 1,
    idea: "String helpers: capitalize and kebab-case slugify.",
    expected: "verified",
    nodes: [
      simpleNode({
        taskId: "t1",
        description: "Write strings.js exporting capitalize(s) and slugify(s) (CommonJS).",
        acceptanceCriteria: "capitalize('hi')==='Hi'; slugify('Hello World!')==='hello-world'",
        files: [
          {
            path: "strings.js",
            content: [
              "exports.capitalize = (s) => (s.length === 0 ? s : s[0].toUpperCase() + s.slice(1));",
              "exports.slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');",
            ].join("\n"),
          },
        ],
        testCommand: "node --test strings.test.js",
        runnerTests: [
          test("strings.test.js", [
            "const { test } = require('node:test');",
            "const assert = require('node:assert');",
            "const { capitalize, slugify } = require('./strings.js');",
            "test('capitalize', () => assert.strictEqual(capitalize('hi'), 'Hi'));",
            "test('empty', () => assert.strictEqual(capitalize(''), ''));",
            "test('slugify', () => assert.strictEqual(slugify('Hello World!'), 'hello-world'));",
          ]),
        ],
      }),
    ],
  },
  {
    id: "e03-fizzbuzz",
    title: "FizzBuzz",
    difficulty: 1,
    idea: "Classic fizzbuzz as a reusable function.",
    expected: "verified",
    nodes: [
      simpleNode({
        taskId: "t1",
        description: "Write fizzbuzz.js exporting fizzbuzz(n) returning the string for n.",
        acceptanceCriteria: "3→'Fizz', 5→'Buzz', 15→'FizzBuzz', 7→'7'",
        files: [
          {
            path: "fizzbuzz.js",
            content: [
              "exports.fizzbuzz = (n) => {",
              "  if (n % 15 === 0) return 'FizzBuzz';",
              "  if (n % 3 === 0) return 'Fizz';",
              "  if (n % 5 === 0) return 'Buzz';",
              "  return String(n);",
              "};",
            ].join("\n"),
          },
        ],
        testCommand: "node --test fizzbuzz.test.js",
        runnerTests: [
          test("fizzbuzz.test.js", [
            "const { test } = require('node:test');",
            "const assert = require('node:assert');",
            "const { fizzbuzz } = require('./fizzbuzz.js');",
            "test('fizz', () => assert.strictEqual(fizzbuzz(3), 'Fizz'));",
            "test('buzz', () => assert.strictEqual(fizzbuzz(5), 'Buzz'));",
            "test('fizzbuzz', () => assert.strictEqual(fizzbuzz(15), 'FizzBuzz'));",
            "test('plain', () => assert.strictEqual(fizzbuzz(7), '7'));",
          ]),
        ],
      }),
    ],
  },
  {
    id: "e04-stats",
    title: "Array statistics",
    difficulty: 2,
    idea: "Numeric helpers: mean and median over arrays.",
    expected: "verified",
    nodes: [
      simpleNode({
        taskId: "t1",
        description: "Write stats.js exporting mean(xs) and median(xs); median of even-length is the midpoint average.",
        acceptanceCriteria: "mean([1,2,3])===2; median([1,2,3,4])===2.5; both throw on empty input",
        files: [
          {
            path: "stats.js",
            content: [
              "const nonEmpty = (xs) => { if (xs.length === 0) throw new Error('empty'); };",
              "exports.mean = (xs) => { nonEmpty(xs); return xs.reduce((a, b) => a + b, 0) / xs.length; };",
              "exports.median = (xs) => {",
              "  nonEmpty(xs);",
              "  const s = [...xs].sort((a, b) => a - b);",
              "  const m = Math.floor(s.length / 2);",
              "  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;",
              "};",
            ].join("\n"),
          },
        ],
        testCommand: "node --test stats.test.js",
        runnerTests: [
          test("stats.test.js", [
            "const { test } = require('node:test');",
            "const assert = require('node:assert');",
            "const { mean, median } = require('./stats.js');",
            "test('mean', () => assert.strictEqual(mean([1, 2, 3]), 2));",
            "test('median odd', () => assert.strictEqual(median([3, 1, 2]), 2));",
            "test('median even', () => assert.strictEqual(median([1, 2, 3, 4]), 2.5));",
            "test('empty throws', () => assert.throws(() => mean([])));",
          ]),
        ],
      }),
    ],
  },
  {
    id: "e05-dates",
    title: "Date formatter",
    difficulty: 2,
    idea: "Format a Date as YYYY-MM-DD with zero padding.",
    expected: "verified",
    nodes: [
      simpleNode({
        taskId: "t1",
        description: "Write dates.js exporting isoDate(d) returning YYYY-MM-DD (UTC, zero-padded).",
        acceptanceCriteria: "isoDate(new Date(Date.UTC(2026, 0, 5))) === '2026-01-05'",
        files: [
          {
            path: "dates.js",
            content: [
              "exports.isoDate = (d) => {",
              "  const p = (n) => String(n).padStart(2, '0');",
              "  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;",
              "};",
            ].join("\n"),
          },
        ],
        testCommand: "node --test dates.test.js",
        runnerTests: [
          test("dates.test.js", [
            "const { test } = require('node:test');",
            "const assert = require('node:assert');",
            "const { isoDate } = require('./dates.js');",
            "test('pads', () => assert.strictEqual(isoDate(new Date(Date.UTC(2026, 0, 5))), '2026-01-05'));",
            "test('year end', () => assert.strictEqual(isoDate(new Date(Date.UTC(2025, 11, 31))), '2025-12-31'));",
          ]),
        ],
      }),
    ],
  },
  {
    id: "e06-temps",
    title: "Temperature converter with validation",
    difficulty: 2,
    idea: "Celsius/Fahrenheit conversion that rejects non-finite input.",
    expected: "verified",
    nodes: [
      simpleNode({
        taskId: "t1",
        description: "Write temps.js exporting cToF(c) and fToC(f); both throw TypeError on non-finite numbers.",
        acceptanceCriteria: "cToF(100)===212; fToC(32)===0; cToF(NaN) throws TypeError",
        files: [
          {
            path: "temps.js",
            content: [
              "const check = (n) => { if (!Number.isFinite(n)) throw new TypeError('non-finite'); };",
              "exports.cToF = (c) => { check(c); return c * 9 / 5 + 32; };",
              "exports.fToC = (f) => { check(f); return (f - 32) * 5 / 9; };",
            ].join("\n"),
          },
        ],
        testCommand: "node --test temps.test.js",
        runnerTests: [
          test("temps.test.js", [
            "const { test } = require('node:test');",
            "const assert = require('node:assert');",
            "const { cToF, fToC } = require('./temps.js');",
            "test('boil', () => assert.strictEqual(cToF(100), 212));",
            "test('freeze', () => assert.strictEqual(fToC(32), 0));",
            "test('NaN throws', () => assert.throws(() => cToF(NaN), TypeError));",
          ]),
        ],
      }),
    ],
  },
  {
    id: "e07-dep-chain",
    title: "Two-task dependency: math lib then calculator",
    difficulty: 3,
    idea: "A calculator built on a separately-delivered math library.",
    expected: "verified",
    nodes: [
      simpleNode({
        taskId: "t1",
        description: "Write mathlib.js exporting add and mul (CommonJS).",
        acceptanceCriteria: "add(2,3)===5; mul(2,3)===6",
        files: [
          { path: "mathlib.js", content: "exports.add = (a, b) => a + b;\nexports.mul = (a, b) => a * b;" },
        ],
        testCommand: "node --test mathlib.test.js",
        runnerTests: [
          test("mathlib.test.js", [
            "const { test } = require('node:test');",
            "const assert = require('node:assert');",
            "const { add, mul } = require('./mathlib.js');",
            "test('add', () => assert.strictEqual(add(2, 3), 5));",
            "test('mul', () => assert.strictEqual(mul(2, 3), 6));",
          ]),
        ],
      }),
      simpleNode({
        taskId: "t2",
        dependsOn: ["t1"],
        description: "Write calc.js exporting evaluate(a, op, b) for '+' and '*', delegating to mathlib.js.",
        acceptanceCriteria: "evaluate(2,'+',3)===5; evaluate(2,'*',3)===6; unknown op throws",
        files: [
          {
            path: "calc.js",
            content: [
              "const { add, mul } = require('./mathlib.js');",
              "exports.evaluate = (a, op, b) => {",
              "  if (op === '+') return add(a, b);",
              "  if (op === '*') return mul(a, b);",
              "  throw new Error(`unknown op ${op}`);",
              "};",
            ].join("\n"),
          },
          // Verify sandboxes are fresh per attempt (ADR-48) — dependent
          // tasks re-write their upstream files so verification is
          // self-contained, matching how the real Coder re-reads context.
          { path: "mathlib.js", content: "exports.add = (a, b) => a + b;\nexports.mul = (a, b) => a * b;" },
        ],
        testCommand: "node --test calc.test.js",
        runnerTests: [
          test("calc.test.js", [
            "const { test } = require('node:test');",
            "const assert = require('node:assert');",
            "const { evaluate } = require('./calc.js');",
            "test('+', () => assert.strictEqual(evaluate(2, '+', 3), 5));",
            "test('*', () => assert.strictEqual(evaluate(2, '*', 3), 6));",
            "test('bad op', () => assert.throws(() => evaluate(1, '/', 2)));",
          ]),
        ],
      }),
    ],
  },
  {
    id: "e08-queue",
    title: "FIFO queue",
    difficulty: 3,
    idea: "A queue data structure with size accounting.",
    expected: "verified",
    nodes: [
      simpleNode({
        taskId: "t1",
        description: "Write queue.js exporting class Queue with enqueue, dequeue (undefined when empty), and size.",
        acceptanceCriteria: "FIFO order; dequeue on empty returns undefined; size tracks correctly",
        files: [
          {
            path: "queue.js",
            content: [
              "class Queue {",
              "  #items = [];",
              "  enqueue(x) { this.#items.push(x); }",
              "  dequeue() { return this.#items.shift(); }",
              "  get size() { return this.#items.length; }",
              "}",
              "exports.Queue = Queue;",
            ].join("\n"),
          },
        ],
        testCommand: "node --test queue.test.js",
        runnerTests: [
          test("queue.test.js", [
            "const { test } = require('node:test');",
            "const assert = require('node:assert');",
            "const { Queue } = require('./queue.js');",
            "test('fifo', () => {",
            "  const q = new Queue();",
            "  q.enqueue(1); q.enqueue(2);",
            "  assert.strictEqual(q.dequeue(), 1);",
            "  assert.strictEqual(q.size, 1);",
            "});",
            "test('empty', () => assert.strictEqual(new Queue().dequeue(), undefined));",
          ]),
        ],
      }),
    ],
  },
  {
    id: "e09-lru",
    title: "LRU cache",
    difficulty: 4,
    idea: "A bounded LRU cache with get/set semantics.",
    expected: "verified",
    nodes: [
      simpleNode({
        taskId: "t1",
        description: "Write lru.js exporting class LruCache(capacity) with get(k) and set(k, v); get refreshes recency; set evicts the least-recently-used past capacity.",
        acceptanceCriteria: "capacity respected; get refreshes recency; miss returns undefined",
        files: [
          {
            path: "lru.js",
            content: [
              "class LruCache {",
              "  #map = new Map();",
              "  constructor(capacity) { this.capacity = capacity; }",
              "  get(k) {",
              "    if (!this.#map.has(k)) return undefined;",
              "    const v = this.#map.get(k);",
              "    this.#map.delete(k); this.#map.set(k, v);",
              "    return v;",
              "  }",
              "  set(k, v) {",
              "    if (this.#map.has(k)) this.#map.delete(k);",
              "    this.#map.set(k, v);",
              "    if (this.#map.size > this.capacity) this.#map.delete(this.#map.keys().next().value);",
              "  }",
              "}",
              "exports.LruCache = LruCache;",
            ].join("\n"),
          },
        ],
        testCommand: "node --test lru.test.js",
        runnerTests: [
          test("lru.test.js", [
            "const { test } = require('node:test');",
            "const assert = require('node:assert');",
            "const { LruCache } = require('./lru.js');",
            "test('evicts lru', () => {",
            "  const c = new LruCache(2);",
            "  c.set('a', 1); c.set('b', 2);",
            "  c.get('a');",
            "  c.set('c', 3);",
            "  assert.strictEqual(c.get('b'), undefined);",
            "  assert.strictEqual(c.get('a'), 1);",
            "  assert.strictEqual(c.get('c'), 3);",
            "});",
          ]),
        ],
      }),
    ],
  },
  {
    id: "e10-csv",
    title: "CSV line parser",
    difficulty: 4,
    idea: "Parse one CSV line honoring quoted fields and escaped quotes.",
    expected: "verified",
    nodes: [
      simpleNode({
        taskId: "t1",
        description: "Write csv.js exporting parseLine(line) → string[]; supports double-quoted fields containing commas and doubled quotes.",
        acceptanceCriteria: "'a,b'→['a','b']; '\"a,b\",c'→['a,b','c']; '\"a\"\"b\"'→['a\"b']",
        files: [
          {
            path: "csv.js",
            content: [
              "exports.parseLine = (line) => {",
              "  const out = [];",
              "  let field = '';",
              "  let quoted = false;",
              "  for (let i = 0; i < line.length; i++) {",
              "    const ch = line[i];",
              "    if (quoted) {",
              "      if (ch === '\"' && line[i + 1] === '\"') { field += '\"'; i++; }",
              "      else if (ch === '\"') quoted = false;",
              "      else field += ch;",
              "    } else if (ch === '\"') quoted = true;",
              "    else if (ch === ',') { out.push(field); field = ''; }",
              "    else field += ch;",
              "  }",
              "  out.push(field);",
              "  return out;",
              "};",
            ].join("\n"),
          },
        ],
        testCommand: "node --test csv.test.js",
        runnerTests: [
          test("csv.test.js", [
            "const { test } = require('node:test');",
            "const assert = require('node:assert');",
            "const { parseLine } = require('./csv.js');",
            "test('plain', () => assert.deepStrictEqual(parseLine('a,b'), ['a', 'b']));",
            "test('quoted comma', () => assert.deepStrictEqual(parseLine('\"a,b\",c'), ['a,b', 'c']));",
            "test('escaped quote', () => assert.deepStrictEqual(parseLine('\"a\"\"b\"'), ['a\"b']));",
            "test('empty fields', () => assert.deepStrictEqual(parseLine('a,,b'), ['a', '', 'b']));",
          ]),
        ],
      }),
    ],
  },
  {
    id: "e11-validator-chain",
    title: "Two-task dependency: validator then form processor",
    difficulty: 4,
    idea: "A form processor built on a standalone field validator.",
    expected: "verified",
    nodes: [
      simpleNode({
        taskId: "t1",
        description: "Write validate.js exporting isEmail(s) and required(s) (CommonJS).",
        acceptanceCriteria: "isEmail('a@b.co')===true; isEmail('nope')===false; required('')===false",
        files: [
          {
            path: "validate.js",
            content: [
              "exports.isEmail = (s) => /^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(s);",
              "exports.required = (s) => typeof s === 'string' && s.trim().length > 0;",
            ].join("\n"),
          },
        ],
        testCommand: "node --test validate.test.js",
        runnerTests: [
          test("validate.test.js", [
            "const { test } = require('node:test');",
            "const assert = require('node:assert');",
            "const { isEmail, required } = require('./validate.js');",
            "test('email ok', () => assert.strictEqual(isEmail('a@b.co'), true));",
            "test('email bad', () => assert.strictEqual(isEmail('nope'), false));",
            "test('required', () => assert.strictEqual(required(' '), false));",
          ]),
        ],
      }),
      simpleNode({
        taskId: "t2",
        dependsOn: ["t1"],
        description: "Write form.js exporting processForm({name, email}) → {ok, errors[]} using validate.js.",
        acceptanceCriteria: "valid input → ok:true, errors []; missing name and bad email each add an error",
        files: [
          {
            path: "form.js",
            content: [
              "const { isEmail, required } = require('./validate.js');",
              "exports.processForm = ({ name, email }) => {",
              "  const errors = [];",
              "  if (!required(name)) errors.push('name required');",
              "  if (!isEmail(email)) errors.push('email invalid');",
              "  return { ok: errors.length === 0, errors };",
              "};",
            ].join("\n"),
          },
          {
            path: "validate.js",
            content: [
              "exports.isEmail = (s) => /^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(s);",
              "exports.required = (s) => typeof s === 'string' && s.trim().length > 0;",
            ].join("\n"),
          },
        ],
        testCommand: "node --test form.test.js",
        runnerTests: [
          test("form.test.js", [
            "const { test } = require('node:test');",
            "const assert = require('node:assert');",
            "const { processForm } = require('./form.js');",
            "test('valid', () => assert.deepStrictEqual(processForm({ name: 'A', email: 'a@b.co' }), { ok: true, errors: [] }));",
            "test('invalid', () => {",
            "  const r = processForm({ name: '', email: 'nope' });",
            "  assert.strictEqual(r.ok, false);",
            "  assert.strictEqual(r.errors.length, 2);",
            "});",
          ]),
        ],
      }),
    ],
  },
  {
    id: "e12-fix-cycle",
    title: "Designed verify→fix cycle",
    difficulty: 3,
    idea: "Exercises the tester-feedback loop: first submission is wrong, the fix lands on the second.",
    expected: "verified",
    nodes: [
      {
        taskId: "t1",
        description: "Write abs.js exporting abs(n) returning the absolute value.",
        acceptanceCriteria: "abs(-3)===3; abs(4)===4",
        dependsOn: [],
        verifyCommand: "node --test abs.test.js",
        testCommand: "node --test abs.test.js",
        runnerTests: [
          test("abs.test.js", [
            "const { test } = require('node:test');",
            "const assert = require('node:assert');",
            "const { abs } = require('./abs.js');",
            "test('neg', () => assert.strictEqual(abs(-3), 3));",
            "test('pos', () => assert.strictEqual(abs(4), 4));",
          ]),
        ],
        scriptedAttempts: [
          [
            // Wrong on purpose — verification must fail, feedback returns,
            // and the scripted fix must then pass: the §10.2 retry-count
            // metric gets a deterministic non-zero sample.
            write("w0", "abs.js", "exports.abs = (n) => n;"),
            submit("s0"),
            write("w1", "abs.js", "exports.abs = (n) => (n < 0 ? -n : n);"),
            submit("s1"),
          ],
        ],
      },
    ],
  },
  {
    id: "e13-three-chain",
    title: "Three-task chain: model → service → CLI",
    difficulty: 5,
    idea: "A todo tracker split across a model, a service layer, and a CLI formatter.",
    expected: "verified",
    nodes: [
      simpleNode({
        taskId: "t1",
        description: "Write model.js exporting makeTodo(title) → {title, done:false} and toggle(todo).",
        acceptanceCriteria: "makeTodo('x').done===false; toggle flips done",
        files: [
          {
            path: "model.js",
            content: [
              "exports.makeTodo = (title) => ({ title, done: false });",
              "exports.toggle = (t) => ({ ...t, done: !t.done });",
            ].join("\n"),
          },
        ],
        testCommand: "node --test model.test.js",
        runnerTests: [
          test("model.test.js", [
            "const { test } = require('node:test');",
            "const assert = require('node:assert');",
            "const { makeTodo, toggle } = require('./model.js');",
            "test('make', () => assert.deepStrictEqual(makeTodo('x'), { title: 'x', done: false }));",
            "test('toggle', () => assert.strictEqual(toggle(makeTodo('x')).done, true));",
          ]),
        ],
      }),
      simpleNode({
        taskId: "t2",
        dependsOn: ["t1"],
        description: "Write service.js exporting class TodoList with add(title), complete(index), and pending() using model.js.",
        acceptanceCriteria: "add then complete(0) → pending() shrinks by one",
        files: [
          {
            path: "service.js",
            content: [
              "const { makeTodo, toggle } = require('./model.js');",
              "class TodoList {",
              "  #items = [];",
              "  add(title) { this.#items.push(makeTodo(title)); }",
              "  complete(i) { this.#items[i] = toggle(this.#items[i]); }",
              "  pending() { return this.#items.filter((t) => !t.done); }",
              "}",
              "exports.TodoList = TodoList;",
            ].join("\n"),
          },
          {
            path: "model.js",
            content: [
              "exports.makeTodo = (title) => ({ title, done: false });",
              "exports.toggle = (t) => ({ ...t, done: !t.done });",
            ].join("\n"),
          },
        ],
        testCommand: "node --test service.test.js",
        runnerTests: [
          test("service.test.js", [
            "const { test } = require('node:test');",
            "const assert = require('node:assert');",
            "const { TodoList } = require('./service.js');",
            "test('complete', () => {",
            "  const l = new TodoList();",
            "  l.add('a'); l.add('b'); l.complete(0);",
            "  assert.deepStrictEqual(l.pending().map((t) => t.title), ['b']);",
            "});",
          ]),
        ],
      }),
      simpleNode({
        taskId: "t3",
        dependsOn: ["t2"],
        description: "Write cli.js exporting render(list) → newline-joined '[ ] title' / '[x] title' lines from a TodoList's items; expose items via pending()+completed() or render from an array.",
        acceptanceCriteria: "render([{title:'a',done:false},{title:'b',done:true}]) === '[ ] a\\n[x] b'",
        files: [
          {
            path: "cli.js",
            content: [
              "exports.render = (todos) => todos.map((t) => `[${t.done ? 'x' : ' '}] ${t.title}`).join('\\n');",
            ].join("\n"),
          },
        ],
        testCommand: "node --test cli.test.js",
        runnerTests: [
          test("cli.test.js", [
            "const { test } = require('node:test');",
            "const assert = require('node:assert');",
            "const { render } = require('./cli.js');",
            "test('render', () => assert.strictEqual(",
            "  render([{ title: 'a', done: false }, { title: 'b', done: true }]),",
            "  '[ ] a\\n[x] b',",
            "));",
          ]),
        ],
      }),
    ],
  },
  {
    id: "e14-escalation",
    title: "Designed escalation: LLM fails terminally every attempt",
    difficulty: 3,
    idea: "Exercises retry exhaustion and the escalation counter: the model transport hard-fails on every attempt.",
    expected: "failed",
    nodes: [
      {
        taskId: "t1",
        description: "Write anything — the scripted model never answers.",
        acceptanceCriteria: "unreachable",
        dependsOn: [],
        verifyCommand: "node --test never.test.js",
        testCommand: "node --test never.test.js",
        runnerTests: [
          test("never.test.js", [
            "const { test } = require('node:test');",
            "test('never runs', () => {});",
          ]),
        ],
        scriptedAttempts: [
          [
            {
              error: new OpenRouterError({
                message: "scripted: provider hard-down",
                status: 400,
                retryable: false,
              }),
            },
          ],
        ],
      },
    ],
  },
  {
    id: "e15-emitter",
    title: "Event emitter",
    difficulty: 5,
    idea: "A minimal event emitter with on/once/off/emit semantics.",
    expected: "verified",
    nodes: [
      simpleNode({
        taskId: "t1",
        description: "Write emitter.js exporting class Emitter with on(evt, fn), once(evt, fn), off(evt, fn), emit(evt, ...args).",
        acceptanceCriteria: "on fires every emit; once fires exactly once; off removes; emit passes args",
        files: [
          {
            path: "emitter.js",
            content: [
              "class Emitter {",
              "  #handlers = new Map();",
              "  #list(evt) {",
              "    if (!this.#handlers.has(evt)) this.#handlers.set(evt, []);",
              "    return this.#handlers.get(evt);",
              "  }",
              "  on(evt, fn) { this.#list(evt).push(fn); return this; }",
              "  once(evt, fn) {",
              "    const wrap = (...args) => { this.off(evt, wrap); fn(...args); };",
              "    wrap.origin = fn;",
              "    return this.on(evt, wrap);",
              "  }",
              "  off(evt, fn) {",
              "    const next = this.#list(evt).filter((h) => h !== fn && h.origin !== fn);",
              "    this.#handlers.set(evt, next);",
              "    return this;",
              "  }",
              "  emit(evt, ...args) { [...this.#list(evt)].forEach((fn) => fn(...args)); return this; }",
              "}",
              "exports.Emitter = Emitter;",
            ].join("\n"),
          },
        ],
        testCommand: "node --test emitter.test.js",
        runnerTests: [
          test("emitter.test.js", [
            "const { test } = require('node:test');",
            "const assert = require('node:assert');",
            "const { Emitter } = require('./emitter.js');",
            "test('on + emit args', () => {",
            "  const e = new Emitter();",
            "  const got = [];",
            "  e.on('x', (a, b) => got.push([a, b]));",
            "  e.emit('x', 1, 2); e.emit('x', 3, 4);",
            "  assert.deepStrictEqual(got, [[1, 2], [3, 4]]);",
            "});",
            "test('once', () => {",
            "  const e = new Emitter();",
            "  let n = 0;",
            "  e.once('x', () => n++);",
            "  e.emit('x'); e.emit('x');",
            "  assert.strictEqual(n, 1);",
            "});",
            "test('off', () => {",
            "  const e = new Emitter();",
            "  let n = 0;",
            "  const fn = () => n++;",
            "  e.on('x', fn); e.off('x', fn); e.emit('x');",
            "  assert.strictEqual(n, 0);",
            "});",
          ]),
        ],
      }),
    ],
  },
  {
    id: "e16-json-diff",
    title: "JSON diff",
    difficulty: 5,
    idea: "A structural diff over plain JSON objects reporting added/removed/changed paths.",
    expected: "verified",
    nodes: [
      simpleNode({
        taskId: "t1",
        description: "Write diff.js exporting diff(a, b) → sorted array of {path, kind: 'added'|'removed'|'changed'} for flat-to-nested plain objects (dot paths).",
        acceptanceCriteria: "detects added/removed/changed keys at nested paths; equal objects → []",
        files: [
          {
            path: "diff.js",
            content: [
              "const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);",
              "function walk(a, b, prefix, out) {",
              "  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);",
              "  for (const k of keys) {",
              "    const path = prefix ? `${prefix}.${k}` : k;",
              "    if (!(k in a)) out.push({ path, kind: 'added' });",
              "    else if (!(k in b)) out.push({ path, kind: 'removed' });",
              "    else if (isObj(a[k]) && isObj(b[k])) walk(a[k], b[k], path, out);",
              "    else if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push({ path, kind: 'changed' });",
              "  }",
              "}",
              "exports.diff = (a, b) => {",
              "  const out = [];",
              "  walk(a, b, '', out);",
              "  return out.sort((x, y) => x.path.localeCompare(y.path));",
              "};",
            ].join("\n"),
          },
        ],
        testCommand: "node --test diff.test.js",
        runnerTests: [
          test("diff.test.js", [
            "const { test } = require('node:test');",
            "const assert = require('node:assert');",
            "const { diff } = require('./diff.js');",
            "test('equal', () => assert.deepStrictEqual(diff({ a: 1 }, { a: 1 }), []));",
            "test('nested change', () => assert.deepStrictEqual(",
            "  diff({ a: { b: 1 } }, { a: { b: 2 } }),",
            "  [{ path: 'a.b', kind: 'changed' }],",
            "));",
            "test('add + remove', () => assert.deepStrictEqual(",
            "  diff({ x: 1 }, { y: 2 }),",
            "  [{ path: 'x', kind: 'removed' }, { path: 'y', kind: 'added' }],",
            "));",
          ]),
        ],
      }),
    ],
  },
];
