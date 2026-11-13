//! The pure crates stay pure: no async runtime, network, database or web framework.

use std::error::Error;

const FORBIDDEN: &[&str] = &[
    "tokio",
    "reqwest",
    "sqlx",
    "axum",
    "hyper",
    "async-std",
    "surrealdb",
];

fn deps(crate_dir: &str) -> Result<Vec<String>, Box<dyn Error>> {
    let path = format!("{}/../{crate_dir}/Cargo.toml", env!("CARGO_MANIFEST_DIR"));
    let doc: toml::Table = std::fs::read_to_string(path)?.parse()?;
    let mut names = Vec::new();
    for section in ["dependencies", "build-dependencies"] {
        if let Some(t) = doc.get(section).and_then(|v| v.as_table()) {
            names.extend(t.keys().cloned());
        }
    }
    Ok(names)
}

#[test]
fn pure_crates_do_no_io() -> Result<(), Box<dyn Error>> {
    for c in ["agents-core", "agents-contracts"] {
        for d in deps(c)? {
            assert!(
                !FORBIDDEN.contains(&d.as_str()),
                "{c} must stay pure but depends on {d}"
            );
        }
    }
    Ok(())
}
