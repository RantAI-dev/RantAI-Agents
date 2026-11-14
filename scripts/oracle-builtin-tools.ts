/**
 * The built-in tools the Rust chat runs, from the old code itself.
 *
 * Runs each case through `BUILTIN_TOOLS[name]` (the zod parse, then `execute`) and prints one
 * JSON line per case: `{"tool","input","output"}`. The Rust test
 * `rust/crates/agents-core/tests/builtin_tools.rs` asserts the same outputs.
 *
 *   TZ=UTC bun scripts/oracle-builtin-tools.ts > rust/crates/agents-core/tests/builtin_tools.jsonl
 *
 * `TZ=UTC`: the old tools ran in the server's zone, the port runs in UTC (differences row 72).
 * It must run from the repository root: outside it, Bun resolves other packages from its cache.
 */

import { BUILTIN_TOOLS } from "../src/lib/tools/builtin"

const CASES: [string, Record<string, unknown>][] = [
  ["calculator", {"expression": "2 + 3 * 4"}],
  ["calculator", {"expression": "15% * 200"}],
  ["calculator", {"expression": "2^10"}],
  ["calculator", {"expression": "Math.sqrt(2)"}],
  ["calculator", {"expression": "0.1 + 0.2"}],
  ["calculator", {"expression": "1/3"}],
  ["calculator", {"expression": "Math.round(-2.5)"}],
  ["calculator", {"expression": "Math.max(1, 5, 3) - Math.min(4, 2)"}],
  ["calculator", {"expression": "1/0"}],
  ["calculator", {"expression": "e"}],
  ["calculator", {"expression": "alert(1)"}],
  ["calculator", {"expression": "-7 % 3"}],
  ["calculator", {"expression": "(1, 2)"}],
  ["calculator", {"expression": "Math.PI * 2"}],
  ["calculator", {"expression": "Math.log10(1000) + Math.log2(8) + Math.log(Math.E)"}],
  ["calculator", {"expression": "Math.sin(0) + Math.cos(0) + Math.tan(0)"}],
  ["calculator", {"expression": "2 ** 0.5"}],
  ["calculator", {"expression": "1e21 + 1"}],
  ["calculator", {"expression": "Math.abs(-3) + Math.ceil(1.2) + Math.floor(1.8)"}],
  ["date_time", {"operation": "format", "date": "2024-03-15T10:30:05.123Z"}],
  ["date_time", {"operation": "format", "date": "2024-03-15T10:30:05.123Z", "format": "PPPPpppp"}],
  ["date_time", {"operation": "format", "date": "2024-03-15T22:30:05.123Z", "format": "P p PP pp PPP ppp"}],
  ["date_time", {"operation": "format", "date": "2024-03-15T00:05:05Z", "format": "yy y yyy yyyyy MMM MMMM MMMMM do EEE EEEE EEEEE EEEEEE h hh H K k a aaa aaaa aaaaa S SS SSS SSSS"}],
  ["date_time", {"operation": "format", "date": "2024-03-15T10:30:05Z", "format": "x xx xxx xxxx xxxxx X XX XXX z zz zzzz O OOOO Q QQ QQQ QQQQ QQQQQ q t T"}],
  ["date_time", {"operation": "format", "date": "2024-03-15T10:30:05Z", "format": "'it''s' dd 'o''clock' '' '"}],
  ["date_time", {"operation": "format", "date": "2024-03-15T10:30:05Z", "format": "yyyy j"}],
  ["date_time", {"operation": "format", "date": "2024-03-01T10:30:05Z", "format": "do d ddd LLL LLLL"}],
  ["date_time", {"operation": "format", "date": "2024-03-02T10:30:05Z", "format": "do"}],
  ["date_time", {"operation": "format", "date": "2024-03-03T10:30:05Z", "format": "do"}],
  ["date_time", {"operation": "format", "date": "2024-03-11T10:30:05Z", "format": "do"}],
  ["date_time", {"operation": "format", "date": "2024-03-22T10:30:05Z", "format": "do"}],
  ["date_time", {"operation": "format", "date": "soon"}],
  ["date_time", {"operation": "format", "date": "2024-03-15"}],
  ["date_time", {"operation": "format", "date": "2024-03-15T17:30:00+07:00", "format": "yyyy-MM-dd HH:mm"}],
  ["date_time", {"operation": "format"}],
  ["date_time", {"operation": "diff", "date": "2024-01-31T00:00:00Z", "date2": "2024-02-29T00:00:00Z", "unit": "months"}],
  ["date_time", {"operation": "diff", "date": "2024-01-31T00:00:00Z", "date2": "2024-03-30T00:00:00Z", "unit": "months"}],
  ["date_time", {"operation": "diff", "date": "2024-03-31T00:00:00Z", "date2": "2024-02-29T00:00:00Z", "unit": "months"}],
  ["date_time", {"operation": "diff", "date": "2024-02-29T00:00:00Z", "date2": "2025-02-28T00:00:00Z", "unit": "years"}],
  ["date_time", {"operation": "diff", "date": "2020-06-15T00:00:00Z", "date2": "2024-06-14T23:00:00Z", "unit": "years"}],
  ["date_time", {"operation": "diff", "date": "2024-06-15T00:00:00Z", "date2": "2020-06-16T00:00:00Z", "unit": "years"}],
  ["date_time", {"operation": "diff", "date": "2024-01-01T10:00:00Z", "date2": "2024-01-03T09:00:00Z"}],
  ["date_time", {"operation": "diff", "date": "2024-01-03T09:00:00Z", "date2": "2024-01-01T10:00:00Z"}],
  ["date_time", {"operation": "diff", "date": "2024-01-01T00:00:00Z", "date2": "2024-01-15T00:00:00Z", "unit": "weeks"}],
  ["date_time", {"operation": "diff", "date": "2024-01-01T09:00:00Z", "date2": "2024-01-01T10:59:00Z", "unit": "hours"}],
  ["date_time", {"operation": "diff", "date": "2024-01-01T09:00:00Z", "date2": "2024-01-01T08:58:30Z", "unit": "minutes"}],
  ["date_time", {"operation": "diff", "date": "2024-01-01", "date2": "nope"}],
  ["date_time", {"operation": "diff", "date": "2024-01-01"}],
  ["date_time", {"operation": "add", "date": "2024-01-31T12:00:00Z", "amount": 1, "unit": "months"}],
  ["date_time", {"operation": "add", "date": "2024-01-31T12:00:00Z", "amount": -1.5, "unit": "months"}],
  ["date_time", {"operation": "add", "date": "2024-02-29T00:00:00Z", "amount": 1, "unit": "years"}],
  ["date_time", {"operation": "add", "date": "2024-01-31T12:00:00Z", "amount": 1.5}],
  ["date_time", {"operation": "add", "date": "2024-01-31T12:00:00Z", "amount": -31, "unit": "days"}],
  ["date_time", {"operation": "add", "date": "2024-01-31T12:00:00Z", "amount": 1.5, "unit": "hours"}],
  ["date_time", {"operation": "add", "date": "2024-01-31T12:00:00Z", "amount": 2, "unit": "weeks", "format": "PP"}],
  ["date_time", {"operation": "add", "date": "2024-01-31T12:00:00Z", "amount": 0, "unit": "months"}],
  ["date_time", {"operation": "add", "date": "2024-01-31T12:00:00Z"}],
  ["date_time", {"operation": "add", "date": "bad", "amount": 1}],
  ["json_transform", {"data": "{\"user\":{\"address\":{\"city\":\"Depok\"}},\"items\":[{\"name\":\"a\"},{\"name\":\"b\"}]}", "operation": "query", "path": "items[1].name"}],
  ["json_transform", {"data": "{\"items\":[1,2,3]}", "operation": "query", "path": "items.length"}],
  ["json_transform", {"data": "{\"items\":[1,2,3]}", "operation": "query", "path": "items.1"}],
  ["json_transform", {"data": "{\"items\":[1,2,3]}", "operation": "query", "path": "nope.x"}],
  ["json_transform", {"data": "{\"items\":[1,2,3]}", "operation": "query"}],
  ["json_transform", {"data": "{\"b\":1,\"2\":2,\"1\":3,\"a\":{\"y\":1,\"0\":2}}", "operation": "flatten"}],
  ["json_transform", {"data": "{\"b\":1,\"a\":2,\"c\":3}", "operation": "pick", "keys": ["c", "a", "z"]}],
  ["json_transform", {"data": "[3,1,2]", "operation": "pick", "keys": ["a"]}],
  ["json_transform", {"data": "[{\"n\":\"b\",\"v\":2},{\"n\":\"A\",\"v\":10},{\"n\":\"a\",\"v\":1}]", "operation": "sort", "sortBy": "v", "order": "desc"}],
  ["json_transform", {"data": "[\"b\",\"B\",\"a\",\"A\",\"_x\",\"10\",\"9\"]", "operation": "sort"}],
  ["json_transform", {"data": "[{\"n\":\"b\"},{\"n\":\"a\"},{\"m\":1}]", "operation": "sort", "sortBy": "n"}],
  ["json_transform", {"data": "[1.5, 1.0, 2]", "operation": "sort"}],
  ["json_transform", {"data": "{", "operation": "flatten"}],
  ["text_utilities", {"text": "Hello world. How are you?\n\nFine!", "operation": "summarize_stats"}],
  ["text_utilities", {"text": "", "operation": "summarize_stats"}],
  ["text_utilities", {"text": "a@b.co, c@d.io and a@b.co", "operation": "extract_emails"}],
  ["text_utilities", {"text": "see https://x.io/a?b=1, or <http://y.dev>", "operation": "extract_urls"}],
  ["text_utilities", {"text": "  Héllo, World -- 2024!  ", "operation": "slug"}],
  ["text_utilities", {"text": "the quick brown fox", "operation": "truncate", "maxLength": 12}],
  ["text_utilities", {"text": "the quick brown fox", "operation": "truncate", "maxLength": -5}],
  ["text_utilities", {"text": "the quick brown fox", "operation": "truncate", "maxLength": 0}],
  ["text_utilities", {"text": "a1 b22", "operation": "regex_match", "pattern": "(?<l>[a-z])(?<d>[0-9]+)"}],
  ["text_utilities", {"text": "a1 b22", "operation": "regex_match", "pattern": "[0-9]+"}],
  ["text_utilities", {"text": "x", "operation": "regex_match"}],
]

for (const [tool, input] of CASES) {
  const definition = BUILTIN_TOOLS[tool]
  if (!definition) throw new Error(`no tool ${tool}`)
  const parsed = definition.parameters.parse(input) as Record<string, unknown>
  const output = await definition.execute(parsed, {})
  process.stdout.write(JSON.stringify({ tool, input, output }) + "\n")
}
