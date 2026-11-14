//! The response-format instruction.
//!
//! Ported from `src/lib/prompts/response-format.ts`: an unknown or default format gets no
//! instruction, the four named ones each get one fixed paragraph.

/// The instruction per named format; `default` has none.
const FORMAT_INSTRUCTIONS: [(&str, &str); 5] = [
    ("default", ""),
    (
        "json",
        "\n\nRESPONSE FORMAT: Always respond with valid JSON. Structure your responses as JSON objects with appropriate keys. Do not include any text outside the JSON.",
    ),
    (
        "markdown",
        "\n\nRESPONSE FORMAT: Always format your responses using Markdown. Use headers, lists, bold, code blocks, and tables where appropriate for readability.",
    ),
    (
        "concise",
        "\n\nRESPONSE FORMAT: Be extremely concise. Give the shortest accurate answer possible. Avoid unnecessary elaboration, filler words, or pleasantries. Use bullet points when listing multiple items.",
    ),
    (
        "detailed",
        "\n\nRESPONSE FORMAT: Provide thorough, detailed responses. Include explanations, examples, and context. Structure your responses with headers and sections for clarity.",
    ),
];

/// The response-format paragraph for a `modelConfig.responseFormat` value, or `None`.
#[must_use]
pub fn get_response_format_instruction(format: Option<&str>) -> String {
    match format {
        Some(name) => FORMAT_INSTRUCTIONS
            .iter()
            .find(|(key, _)| *key == name)
            .map_or_else(String::new, |(_, instruction)| (*instruction).to_owned()),
        None => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_and_unknown_formats() {
        assert_eq!(get_response_format_instruction(None), "");
        assert_eq!(get_response_format_instruction(Some("default")), "");
        assert_eq!(
            get_response_format_instruction(Some("json")),
            "\n\nRESPONSE FORMAT: Always respond with valid JSON. Structure your responses as JSON objects with appropriate keys. Do not include any text outside the JSON."
        );
        assert_eq!(get_response_format_instruction(Some("xml")), "");
        // Case-sensitive, like the old record lookup.
        assert_eq!(get_response_format_instruction(Some("JSON")), "");
    }
}
