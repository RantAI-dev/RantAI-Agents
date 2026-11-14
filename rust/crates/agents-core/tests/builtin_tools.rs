//! The built-in tools against the old ones: `tests/builtin_tools.jsonl` is printed by
//! `TZ=UTC bun scripts/oracle-builtin-tools.ts`, which runs each case through the TypeScript
//! tool (`src/lib/tools/builtin/*`).

use serde_json::Value;

#[test]
fn every_case_gives_the_old_output() -> Result<(), Box<dyn std::error::Error>> {
    let mut failures = Vec::new();
    let mut cases = 0;
    for line in include_str!("builtin_tools.jsonl").lines() {
        let case: Value = serde_json::from_str(line)?;
        let tool = case.get("tool").and_then(Value::as_str).unwrap_or_default();
        let input = case.get("input").cloned().unwrap_or(Value::Null);
        let expected = case.get("output").cloned().unwrap_or(Value::Null);
        let parsed = agents_core::tools::validate(tool, &input)?;
        let output = agents_core::tools::execute(tool, &parsed, 0).unwrap_or(Value::Null);
        if output != expected {
            failures.push(format!(
                "{tool} {input}\n  old: {expected}\n  new: {output}"
            ));
        }
        cases += 1;
    }
    assert!(cases > 80, "the case file is missing cases");
    assert!(failures.is_empty(), "{}", failures.join("\n"));
    Ok(())
}
