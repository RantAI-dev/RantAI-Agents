//! `calculator`: evaluates an arithmetic expression.
//!
//! Old: `src/lib/tools/builtin/calculator.ts`. The old tool checked the text against two
//! patterns and then ran it as JavaScript (`new Function`). The port keeps the same check and
//! evaluates the same JavaScript subset itself: numbers, `+ - * / % **`, parentheses, the comma
//! operator and the `Math` functions the pattern allows.

use std::sync::LazyLock;

use regex::Regex;
use serde_json::{Map, Value, json};

use super::js;

pub const INPUT_SCHEMA: &str = r#"{"type":"object","properties":{"expression":{"type":"string","description":"The mathematical expression to evaluate, e.g. \"2 + 3 * 4\", \"Math.sqrt(16)\", \"15% * 200\""}},"required":["expression"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}"#;

const UNSUPPORTED: &str = "Expression contains unsupported characters. Only numbers, operators (+, -, *, /, ^, %), parentheses, and Math.* functions are allowed.";
const NOT_FINITE: &str = "Expression did not evaluate to a finite number";
/// The JavaScript engine's own syntax messages are not reproduced (differences row 71).
const NOT_VALID: &str = "The expression is not valid arithmetic.";

// `\d` is spelled `0-9`: JavaScript's `\d` is ASCII, Rust's is Unicode.
static PERCENT: LazyLock<Option<Regex>> = LazyLock::new(|| Regex::new(r"([0-9]+)%").ok());
static SAFE: LazyLock<Option<Regex>> = LazyLock::new(|| {
    Regex::new(
        r"^[0-9\s+\-*/().,%^e]+$|^[0-9\s+\-*/().,%^e]*(Math\.(abs|ceil|floor|round|sqrt|pow|min|max|log|log2|log10|sin|cos|tan|PI|E)[0-9\s+\-*/().,%^e]*)+$",
    )
    .ok()
});
static LOOSE: LazyLock<Option<Regex>> =
    LazyLock::new(|| Regex::new(r"^[0-9\s+\-*/().^*%eE]+$").ok());

/// Runs the tool.
#[must_use]
pub fn run(input: &Map<String, Value>) -> Value {
    let expression = super::text(input, "expression").unwrap_or_default();
    match evaluate(expression) {
        Ok(result) => {
            json!({"success": true, "expression": expression, "result": js::number(result)})
        }
        Err(error) => json!({"success": false, "expression": expression, "error": error}),
    }
}

/// `safeEval`.
///
/// # Errors
/// The message the old tool returned.
pub fn evaluate(expression: &str) -> Result<f64, String> {
    let (Some(percent), Some(safe), Some(loose)) = (&*PERCENT, &*SAFE, &*LOOSE) else {
        return Err(NOT_VALID.to_owned());
    };
    let normalized = expression.replace('^', "**");
    let normalized = percent.replace_all(&normalized, "(${1}/100)").into_owned();
    if !safe.is_match(&normalized) && !loose.is_match(&normalized) {
        return Err(UNSUPPORTED.to_owned());
    }
    let tokens = tokenize(&normalized)?;
    let mut parser = Parser { tokens, at: 0 };
    let value = parser.sequence()?;
    if parser.at != parser.tokens.len() {
        return Err(NOT_VALID.to_owned());
    }
    match value {
        Val::Num(number) if number.is_finite() => Ok(number),
        _ => Err(NOT_FINITE.to_owned()),
    }
}

#[derive(Debug, Clone, PartialEq)]
enum Token {
    Num(f64),
    Ident(String),
    Plus,
    Minus,
    Star,
    StarStar,
    Slash,
    Percent,
    Open,
    Close,
    Comma,
    Dot,
    /// `++` or `--`: an update operator, which arithmetic on literals cannot use.
    Update,
}

/// The tokens of the expression, without the whitespace and the comments.
fn tokenize(text: &str) -> Result<Vec<Token>, String> {
    let chars: Vec<char> = text.chars().collect();
    let mut tokens = Vec::new();
    let mut at = 0;
    let char_at = |index: usize| chars.get(index).copied();
    while let Some(c) = char_at(at) {
        let next = char_at(at + 1);
        match c {
            c if c.is_whitespace() => at += 1,
            '/' if next == Some('/') => {
                while char_at(at).is_some_and(|c| c != '\n' && c != '\r') {
                    at += 1;
                }
                // The old code ran `return (${expression})`: a comment that reaches the end
                // also comments out the closing parenthesis.
                if char_at(at).is_none() {
                    return Err(NOT_VALID.to_owned());
                }
            }
            '/' if next == Some('*') => {
                at += 2;
                loop {
                    match char_at(at) {
                        None => return Err(NOT_VALID.to_owned()),
                        Some('*') if char_at(at + 1) == Some('/') => {
                            at += 2;
                            break;
                        }
                        Some(_) => at += 1,
                    }
                }
            }
            '0'..='9' => {
                let (number, end) = number_literal(&chars, at)?;
                tokens.push(Token::Num(number));
                at = end;
            }
            '.' if next.is_some_and(|c| c.is_ascii_digit()) => {
                let (number, end) = number_literal(&chars, at)?;
                tokens.push(Token::Num(number));
                at = end;
            }
            c if c.is_ascii_alphabetic() || c == '_' || c == '$' => {
                let start = at;
                while char_at(at).is_some_and(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$')
                {
                    at += 1;
                }
                tokens.push(Token::Ident(
                    chars.get(start..at).unwrap_or(&[]).iter().collect(),
                ));
            }
            _ => {
                let (token, width) = match (c, next) {
                    ('*', Some('*')) => (Token::StarStar, 2),
                    ('+', Some('+')) | ('-', Some('-')) => (Token::Update, 2),
                    ('+', _) => (Token::Plus, 1),
                    ('-', _) => (Token::Minus, 1),
                    ('*', _) => (Token::Star, 1),
                    ('/', _) => (Token::Slash, 1),
                    ('%', _) => (Token::Percent, 1),
                    ('(', _) => (Token::Open, 1),
                    (')', _) => (Token::Close, 1),
                    (',', _) => (Token::Comma, 1),
                    ('.', _) => (Token::Dot, 1),
                    _ => return Err(NOT_VALID.to_owned()),
                };
                tokens.push(token);
                at += width;
            }
        }
    }
    Ok(tokens)
}

/// A JavaScript numeric literal starting at `start`, in strict mode (no legacy octal).
fn number_literal(chars: &[char], start: usize) -> Result<(f64, usize), String> {
    let char_at = |index: usize| chars.get(index).copied();
    let digit_at = |index: usize| char_at(index).is_some_and(|c| c.is_ascii_digit());
    let mut at = start;
    if char_at(at) == Some('0') && digit_at(at + 1) {
        return Err(NOT_VALID.to_owned());
    }
    while digit_at(at) {
        at += 1;
    }
    if char_at(at) == Some('.') {
        at += 1;
        while digit_at(at) {
            at += 1;
        }
    }
    if matches!(char_at(at), Some('e' | 'E')) {
        let mut exponent = at + 1;
        if matches!(char_at(exponent), Some('+' | '-')) {
            exponent += 1;
        }
        if !digit_at(exponent) {
            return Err(NOT_VALID.to_owned());
        }
        while digit_at(exponent) {
            exponent += 1;
        }
        at = exponent;
    }
    // "No identifiers allowed directly after numeric literal".
    if char_at(at).is_some_and(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$') {
        return Err(NOT_VALID.to_owned());
    }
    let text: String = chars.get(start..at).unwrap_or(&[]).iter().collect();
    text.parse::<f64>()
        .map(|number| (number, at))
        .map_err(|_| NOT_VALID.to_owned())
}

/// A value of the subset: a number, the `Math` object, one of its functions, or `undefined`.
#[derive(Debug, Clone, Copy, PartialEq)]
enum Val {
    Num(f64),
    Math,
    Func(MathFn),
    Undefined,
}

impl Val {
    /// `ToNumber`: anything but a number is `NaN` here.
    fn number(self) -> f64 {
        match self {
            Self::Num(number) => number,
            _ => f64::NAN,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum MathFn {
    Abs,
    Ceil,
    Floor,
    Round,
    Sqrt,
    Pow,
    Min,
    Max,
    Log,
    Log2,
    Log10,
    Sin,
    Cos,
    Tan,
}

impl MathFn {
    fn call(self, args: &[f64]) -> f64 {
        let first = args.first().copied().unwrap_or(f64::NAN);
        match self {
            Self::Abs => first.abs(),
            Self::Ceil => first.ceil(),
            Self::Floor => first.floor(),
            Self::Round => js::math_round(first),
            Self::Sqrt => first.sqrt(),
            Self::Pow => pow(first, args.get(1).copied().unwrap_or(f64::NAN)),
            Self::Min => args.iter().fold(f64::INFINITY, |least, &value| {
                if least.is_nan() || value.is_nan() {
                    f64::NAN
                } else {
                    least.min(value)
                }
            }),
            Self::Max => args.iter().fold(f64::NEG_INFINITY, |most, &value| {
                if most.is_nan() || value.is_nan() {
                    f64::NAN
                } else {
                    most.max(value)
                }
            }),
            Self::Log => first.ln(),
            Self::Log2 => first.log2(),
            Self::Log10 => first.log10(),
            Self::Sin => first.sin(),
            Self::Cos => first.cos(),
            Self::Tan => first.tan(),
        }
    }
}

/// `Math` member lookup.
fn math_member(name: &str) -> Val {
    let function = match name {
        "abs" => MathFn::Abs,
        "ceil" => MathFn::Ceil,
        "floor" => MathFn::Floor,
        "round" => MathFn::Round,
        "sqrt" => MathFn::Sqrt,
        "pow" => MathFn::Pow,
        "min" => MathFn::Min,
        "max" => MathFn::Max,
        "log" => MathFn::Log,
        "log2" => MathFn::Log2,
        "log10" => MathFn::Log10,
        "sin" => MathFn::Sin,
        "cos" => MathFn::Cos,
        "tan" => MathFn::Tan,
        "PI" => return Val::Num(std::f64::consts::PI),
        "E" => return Val::Num(std::f64::consts::E),
        _ => return Val::Undefined,
    };
    Val::Func(function)
}

/// `**` as JavaScript defines it: `NaN` for a `NaN` exponent and for `±1 ** ±Infinity`.
fn pow(base: f64, exponent: f64) -> f64 {
    if exponent.is_nan() || (base.abs() == 1.0 && exponent.is_infinite()) {
        return f64::NAN;
    }
    base.powf(exponent)
}

/// A recursive-descent parser that evaluates as it goes.
struct Parser {
    tokens: Vec<Token>,
    at: usize,
}

impl Parser {
    fn peek(&self) -> Option<&Token> {
        self.tokens.get(self.at)
    }

    fn eat(&mut self, token: &Token) -> bool {
        if self.peek() == Some(token) {
            self.at += 1;
            true
        } else {
            false
        }
    }

    /// The comma operator: every operand is evaluated, the last one is the value.
    fn sequence(&mut self) -> Result<Val, String> {
        let mut value = self.additive()?;
        while self.eat(&Token::Comma) {
            value = self.additive()?;
        }
        Ok(value)
    }

    fn additive(&mut self) -> Result<Val, String> {
        let mut value = self.multiplicative()?;
        loop {
            if self.eat(&Token::Plus) {
                value = Val::Num(value.number() + self.multiplicative()?.number());
            } else if self.eat(&Token::Minus) {
                value = Val::Num(value.number() - self.multiplicative()?.number());
            } else {
                return Ok(value);
            }
        }
    }

    fn multiplicative(&mut self) -> Result<Val, String> {
        let mut value = self.unary()?;
        loop {
            if self.eat(&Token::Star) {
                value = Val::Num(value.number() * self.unary()?.number());
            } else if self.eat(&Token::Slash) {
                value = Val::Num(value.number() / self.unary()?.number());
            } else if self.eat(&Token::Percent) {
                value = Val::Num(value.number() % self.unary()?.number());
            } else {
                return Ok(value);
            }
        }
    }

    /// A unary expression, or an exponentiation. `-2 ** 2` is a syntax error in JavaScript: the
    /// left side of `**` may not be a unary expression.
    fn unary(&mut self) -> Result<Val, String> {
        if let Some(sign) = self.sign() {
            let value = self.prefixed()?;
            if self.peek() == Some(&Token::StarStar) {
                return Err(NOT_VALID.to_owned());
            }
            return Ok(Val::Num(sign * value.number()));
        }
        let base = self.postfix()?;
        if self.eat(&Token::StarStar) {
            let exponent = self.unary()?;
            return Ok(Val::Num(pow(base.number(), exponent.number())));
        }
        Ok(base)
    }

    /// The operand of a prefix sign.
    fn prefixed(&mut self) -> Result<Val, String> {
        if let Some(sign) = self.sign() {
            let value = self.prefixed()?;
            return Ok(Val::Num(sign * value.number()));
        }
        self.postfix()
    }

    fn sign(&mut self) -> Option<f64> {
        if self.eat(&Token::Minus) {
            Some(-1.0)
        } else if self.eat(&Token::Plus) {
            Some(1.0)
        } else {
            None
        }
    }

    /// A primary expression followed by member reads and calls.
    fn postfix(&mut self) -> Result<Val, String> {
        let mut value = self.primary()?;
        loop {
            if self.eat(&Token::Dot) {
                let Some(Token::Ident(name)) = self.peek().cloned() else {
                    return Err(NOT_VALID.to_owned());
                };
                self.at += 1;
                value = match value {
                    Val::Math => math_member(&name),
                    Val::Undefined => return Err("undefined is not an object".to_owned()),
                    _ => Val::Undefined,
                };
            } else if self.eat(&Token::Open) {
                let mut args = Vec::new();
                if !self.eat(&Token::Close) {
                    loop {
                        args.push(self.additive()?.number());
                        if self.eat(&Token::Close) {
                            break;
                        }
                        if !self.eat(&Token::Comma) {
                            return Err(NOT_VALID.to_owned());
                        }
                    }
                }
                let Val::Func(function) = value else {
                    return Err("The expression calls something that is not a function.".to_owned());
                };
                value = Val::Num(function.call(&args));
            } else {
                return Ok(value);
            }
        }
    }

    fn primary(&mut self) -> Result<Val, String> {
        let Some(token) = self.peek().cloned() else {
            return Err(NOT_VALID.to_owned());
        };
        self.at += 1;
        match token {
            Token::Num(number) => Ok(Val::Num(number)),
            Token::Open => {
                let value = self.sequence()?;
                if self.eat(&Token::Close) {
                    Ok(value)
                } else {
                    Err(NOT_VALID.to_owned())
                }
            }
            Token::Ident(name) if name == "Math" => Ok(Val::Math),
            // The wording Bun gives a missing variable.
            Token::Ident(name) => Err(format!("{name} is not defined")),
            _ => Err(NOT_VALID.to_owned()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ok(expression: &str) -> f64 {
        evaluate(expression).unwrap_or(f64::NAN)
    }

    #[test]
    fn arithmetic_follows_javascript() {
        assert_eq!(ok("2 + 3 * 4"), 14.0);
        assert_eq!(ok("15% * 200"), 30.0);
        assert_eq!(ok("2^10"), 1024.0);
        assert_eq!(ok("2 ** 3 ** 2"), 512.0);
        assert_eq!(ok("2 ** -1"), 0.5);
        assert_eq!(ok("-7 % 3"), -1.0);
        assert_eq!(ok("Math.sqrt(16) + Math.max(1, 5, 3)"), 9.0);
        assert_eq!(ok("Math.round(2.5) + Math.round(-2.5)"), 1.0);
        assert_eq!(ok("Math.pow(2, 8)"), 256.0);
        assert_eq!(ok("(1, 2)"), 2.0);
        assert_eq!(ok(".5 + 1."), 1.5);
        assert_eq!(ok("1e3"), 1000.0);
        assert_eq!(ok("2 // 3\n + 1"), 3.0);
        assert_eq!(ok("2 /* 3 */ + 1"), 3.0);
        assert_eq!(ok("0.1 + 0.2"), 0.1 + 0.2);
        assert!((ok("Math.PI") - std::f64::consts::PI).abs() < f64::EPSILON);
    }

    #[test]
    fn what_javascript_refuses_is_refused() {
        assert_eq!(evaluate("alert(1)"), Err(UNSUPPORTED.to_owned()));
        assert_eq!(evaluate("1 / 0"), Err(NOT_FINITE.to_owned()));
        assert_eq!(evaluate("Math.sqrt"), Err(NOT_FINITE.to_owned()));
        assert_eq!(evaluate("Math.min()"), Err(NOT_FINITE.to_owned()));
        assert_eq!(evaluate("e"), Err("e is not defined".to_owned()));
        for invalid in [
            "-2 ** 2", "5--3", "1 2", "010", "1e", "(1", "10%3", "2 /* 3", "2 // 3",
        ] {
            assert_eq!(evaluate(invalid), Err(NOT_VALID.to_owned()), "{invalid}");
        }
    }

    #[test]
    fn the_output_is_the_old_object() {
        let mut input = Map::new();
        input.insert("expression".to_owned(), json!("2 + 3 * 4"));
        assert_eq!(
            run(&input),
            json!({"success": true, "expression": "2 + 3 * 4", "result": 14})
        );
        input.insert("expression".to_owned(), json!("1/0"));
        assert_eq!(
            run(&input),
            json!({"success": false, "expression": "1/0", "error": NOT_FINITE})
        );
    }
}
