//! The binding PUT bodies' tool ids.
//!
//! Ported from `src/features/assistants/bindings/service.ts:74-80`: the ids the caller
//! sends are merged with the tool bindings that are hidden from the assistant's picker so
//! a PUT cannot drop them. The skill (and MCP and workflow) PUTs drop empty strings the
//! same way, without a hidden set.

use serde_json::Value;

/// The ids in a PUT body that count: strings that are not empty. The old code checked
/// `typeof id === "string" && id.length > 0` and left every other element out.
#[must_use]
pub fn non_empty_string_ids(values: &[Value]) -> Vec<String> {
    values
        .iter()
        .filter_map(Value::as_str)
        .filter(|id| !id.is_empty())
        .map(str::to_owned)
        .collect()
}

/// The tool binding list a tool PUT writes: the caller's ids with the hidden bindings
/// re-appended, deduplicated the way a `Set` does it (first occurrence wins).
///
/// The hidden ids come from the store (`findHiddenAssistantToolIds`) and are always
/// strings there, so they arrive as `&[String]`.
#[must_use]
pub fn merge_hidden_tool_ids(tool_ids: &[Value], hidden_tool_ids: &[String]) -> Vec<String> {
    let mut merged = Vec::with_capacity(tool_ids.len() + hidden_tool_ids.len());
    for id in non_empty_string_ids(tool_ids)
        .into_iter()
        .chain(hidden_tool_ids.iter().cloned())
    {
        if !merged.contains(&id) {
            merged.push(id);
        }
    }
    merged
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::error::Error;

    #[test]
    fn empty_ids_are_dropped_but_whitespace_is_kept() -> Result<(), Box<dyn Error>> {
        let ids: Vec<Value> = serde_json::from_value(json!(["", "skill_1", "   "]))?;
        assert_eq!(
            non_empty_string_ids(&ids),
            vec!["skill_1".to_owned(), "   ".to_owned()]
        );
        Ok(())
    }

    #[test]
    fn hidden_bindings_survive_a_put() -> Result<(), Box<dyn Error>> {
        let ids: Vec<Value> = serde_json::from_value(json!(["visible_tool"]))?;
        let hidden = vec!["hidden_tool".to_owned()];
        assert_eq!(
            merge_hidden_tool_ids(&ids, &hidden),
            vec!["visible_tool".to_owned(), "hidden_tool".to_owned()]
        );
        let duplicates: Vec<Value> = serde_json::from_value(json!(["a", "a", "b"]))?;
        let hidden_duplicates = vec!["h".to_owned(), "h".to_owned()];
        assert_eq!(
            merge_hidden_tool_ids(&duplicates, &hidden_duplicates),
            vec!["a".to_owned(), "b".to_owned(), "h".to_owned()]
        );
        Ok(())
    }

    #[test]
    fn a_hidden_id_the_caller_also_sent_is_kept_once() -> Result<(), Box<dyn Error>> {
        let ids: Vec<Value> = serde_json::from_value(json!(["a"]))?;
        let hidden = vec!["a".to_owned()];
        assert_eq!(merge_hidden_tool_ids(&ids, &hidden), vec!["a".to_owned()]);
        Ok(())
    }
}
