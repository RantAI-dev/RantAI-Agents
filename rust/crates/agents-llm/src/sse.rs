//! An incremental Server-Sent Events parser.
//!
//! The provider sends `text/event-stream` bytes in whatever chunks the network gives us: a line
//! can be split in half, a UTF-8 character can be split in half, a comment can arrive alone. The
//! parser takes bytes in any chunking and yields whole events.

/// One event out of the stream.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SseEvent {
    /// The `data:` payload of one event, without the trailing newline.
    Data(String),
    /// The `[DONE]` sentinel.
    Done,
}

/// A parser that accepts bytes in any chunking and yields whole events.
#[derive(Debug, Default)]
pub struct SseParser {
    /// The bytes we have not turned into lines yet.
    buffer: Vec<u8>,
    /// Where the next line starts in `buffer`.
    start: usize,
    /// The `data:` payload of the event being built.
    data: String,
    /// Whether the event being built has any data.
    has_data: bool,
}

impl SseParser {
    /// A parser with nothing in it.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Feed bytes in. Returns the events that completed.
    pub fn push(&mut self, bytes: &[u8]) -> Vec<SseEvent> {
        let mut events = Vec::new();
        self.buffer.extend_from_slice(bytes);
        while let Some(offset) = self
            .buffer
            .get(self.start..)
            .unwrap_or(&[])
            .iter()
            .position(|b| *b == b'\n')
        {
            let end = self.start + offset;
            let line = self.buffer.get(self.start..end).unwrap_or(&[]).to_vec();
            self.start = end + 1;
            self.handle_line(&line, &mut events);
        }
        self.compact();
        events
    }

    /// The stream ended. Returns the events that were still being built.
    pub fn finish(&mut self) -> Vec<SseEvent> {
        let mut events = Vec::new();
        if self.start < self.buffer.len() {
            let line = self.buffer.get(self.start..).unwrap_or(&[]).to_vec();
            self.start = self.buffer.len();
            self.handle_line(&line, &mut events);
        }
        self.dispatch(&mut events);
        self.compact();
        events
    }

    /// One line, without its newline. A CRLF line keeps the `\r` out of the value.
    fn handle_line(&mut self, raw: &[u8], events: &mut Vec<SseEvent>) {
        let line = match raw.strip_suffix(b"\r") {
            Some(stripped) => stripped,
            None => raw,
        };
        if line.is_empty() {
            self.dispatch(events);
            return;
        }
        if line.first() == Some(&b':') {
            // A comment, which is also how providers send keep-alives.
            return;
        }
        let separator = line.iter().position(|b| *b == b':');
        let (field, value) = match separator {
            Some(index) => {
                let field = line.get(..index).unwrap_or(&[]);
                let mut value = line.get(index + 1..).unwrap_or(&[]);
                if value.first() == Some(&b' ') {
                    value = value.get(1..).unwrap_or(&[]);
                }
                (field, value)
            }
            None => (line, &[][..]),
        };
        if field == b"data" {
            self.data.push_str(&String::from_utf8_lossy(value));
            self.data.push('\n');
            self.has_data = true;
        }
    }

    /// A blank line ended the event: hand it over.
    fn dispatch(&mut self, events: &mut Vec<SseEvent>) {
        if !self.has_data {
            return;
        }
        // The spec joins the data lines with a newline and drops the last one.
        let payload = self
            .data
            .strip_suffix('\n')
            .unwrap_or(&self.data)
            .to_owned();
        self.data.clear();
        self.has_data = false;
        if payload == "[DONE]" {
            events.push(SseEvent::Done);
        } else {
            events.push(SseEvent::Data(payload));
        }
    }

    /// Drop the bytes we have already turned into lines.
    fn compact(&mut self) {
        if self.start == self.buffer.len() {
            self.buffer.clear();
            self.start = 0;
        } else if self.start > 64 * 1024 {
            self.buffer.drain(..self.start);
            self.start = 0;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn data_of(events: &[SseEvent]) -> Vec<String> {
        events
            .iter()
            .filter_map(|event| match event {
                SseEvent::Data(text) => Some(text.clone()),
                SseEvent::Done => None,
            })
            .collect()
    }

    #[test]
    fn one_event_in_one_chunk() {
        let mut parser = SseParser::new();
        let events = parser.push(b"data: {\"a\":1}\n\n");
        assert_eq!(data_of(&events), vec![r#"{"a":1}"#.to_owned()]);
    }

    #[test]
    fn a_line_split_across_chunks() {
        let mut parser = SseParser::new();
        assert!(parser.push(b"data: {\"a\":").is_empty());
        assert!(parser.push(b"1}").is_empty());
        let events = parser.push(b"\n\n");
        assert_eq!(data_of(&events), vec![r#"{"a":1}"#.to_owned()]);
    }

    #[test]
    fn every_single_byte_on_its_own() {
        let payload = "data: {\"a\":\"\u{00e9}\"}\n\ndata: [DONE]\n\n";
        let mut parser = SseParser::new();
        let mut events = Vec::new();
        for byte in payload.as_bytes() {
            events.extend(parser.push(&[*byte]));
        }
        assert_eq!(data_of(&events), vec![r#"{"a":"é"}"#.to_owned()]);
        assert!(events.contains(&SseEvent::Done));
    }

    #[test]
    fn a_utf8_character_split_across_chunks() {
        let mut parser = SseParser::new();
        // "é" is two bytes; the first one alone is not a character.
        let first = "data: é".as_bytes();
        let split = first.len() - 1;
        assert!(parser.push(first.get(..split).unwrap_or(&[])).is_empty());
        let events = parser.push(first.get(split..).unwrap_or(&[]));
        assert!(events.is_empty());
        let events = parser.push(b"\n\n");
        assert_eq!(data_of(&events), vec!["é".to_owned()]);
    }

    #[test]
    fn comments_and_keep_alives_are_ignored() {
        let mut parser = SseParser::new();
        let events = parser.push(b": keep-alive\n\ndata: one\n\n: another\n\ndata: two\n\n");
        assert_eq!(data_of(&events), vec!["one".to_owned(), "two".to_owned()]);
    }

    #[test]
    fn carriage_returns_are_stripped() {
        let mut parser = SseParser::new();
        let events = parser.push(b"data: one\r\n\r\ndata: two\r\n\r\n");
        assert_eq!(data_of(&events), vec!["one".to_owned(), "two".to_owned()]);
    }

    #[test]
    fn a_crlf_split_across_chunks() {
        let mut parser = SseParser::new();
        assert!(parser.push(b"data: one\r").is_empty());
        let events = parser.push(b"\n\r\n");
        assert_eq!(data_of(&events), vec!["one".to_owned()]);
    }

    #[test]
    fn the_done_sentinel_is_its_own_event() {
        let mut parser = SseParser::new();
        let events = parser.push(b"data: [DONE]\n\n");
        assert_eq!(events, vec![SseEvent::Done]);
    }

    #[test]
    fn several_data_lines_make_one_event() {
        let mut parser = SseParser::new();
        let events = parser.push(b"data: one\ndata: two\n\n");
        assert_eq!(data_of(&events), vec!["one\ntwo".to_owned()]);
    }

    #[test]
    fn a_value_without_a_space_after_the_colon() {
        let mut parser = SseParser::new();
        let events = parser.push(b"data:{\"a\":1}\n\n");
        assert_eq!(data_of(&events), vec![r#"{"a":1}"#.to_owned()]);
    }

    #[test]
    fn a_field_without_a_colon_is_ignored() {
        let mut parser = SseParser::new();
        let events = parser.push(b"nonsense\n\ndata: one\n\n");
        assert_eq!(data_of(&events), vec!["one".to_owned()]);
    }

    #[test]
    fn the_last_event_may_have_no_newline() {
        let mut parser = SseParser::new();
        let events = parser.push(b"data: one\n\ndata: two");
        assert_eq!(data_of(&events), vec!["one".to_owned()]);
        let events = parser.finish();
        assert_eq!(data_of(&events), vec!["two".to_owned()]);
    }

    #[test]
    fn the_done_sentinel_without_a_newline_still_ends_the_stream() {
        let mut parser = SseParser::new();
        assert!(parser.push(b"data: [DONE]").is_empty());
        let events = parser.finish();
        assert_eq!(events, vec![SseEvent::Done]);
    }

    #[test]
    fn an_empty_stream_gives_nothing() {
        let mut parser = SseParser::new();
        assert!(parser.push(b"").is_empty());
        assert!(parser.finish().is_empty());
    }
}
