//! The unit tree of one organisation, built from a parent map: who is above and below whom.

use std::collections::{BTreeMap, BTreeSet};

/// Why a parent map is not a tree.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum TreeError {
    /// Following parents from this unit comes back to it.
    #[error("unit {0} is its own ancestor")]
    Cycle(String),
    /// The parent is not a unit of this organisation.
    #[error("unit {unit} names an unknown parent {parent}")]
    UnknownParent { unit: String, parent: String },
}

/// A forest of units. Only [`UnitTree::new`] builds one, so a value is always acyclic.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct UnitTree {
    parent: BTreeMap<String, Option<String>>,
    children: BTreeMap<String, Vec<String>>,
}

impl UnitTree {
    /// Builds the tree from `(unit, parent)` pairs, rejecting a cycle or a dangling parent.
    ///
    /// # Errors
    /// [`TreeError`] when the pairs are not a forest.
    pub fn new<I>(units: I) -> Result<Self, TreeError>
    where
        I: IntoIterator<Item = (String, Option<String>)>,
    {
        let parent: BTreeMap<String, Option<String>> = units.into_iter().collect();
        let mut children: BTreeMap<String, Vec<String>> = BTreeMap::new();
        for (unit, p) in &parent {
            if let Some(p) = p {
                if !parent.contains_key(p) {
                    return Err(TreeError::UnknownParent {
                        unit: unit.clone(),
                        parent: p.clone(),
                    });
                }
                children.entry(p.clone()).or_default().push(unit.clone());
            }
        }
        let tree = Self { parent, children };
        // Every walk is bounded by the unit count, so a cycle is found, never looped on.
        for unit in tree.parent.keys() {
            let mut seen = BTreeSet::new();
            let mut at = Some(unit.as_str());
            while let Some(u) = at {
                if !seen.insert(u) {
                    return Err(TreeError::Cycle(unit.clone()));
                }
                at = tree.parent_of(u);
            }
        }
        Ok(tree)
    }

    #[must_use]
    pub fn contains(&self, unit: &str) -> bool {
        self.parent.contains_key(unit)
    }

    #[must_use]
    pub fn parent_of(&self, unit: &str) -> Option<&str> {
        self.parent.get(unit).and_then(Option::as_deref)
    }

    /// Every unit id, in id order.
    pub fn units(&self) -> impl Iterator<Item = &str> {
        self.parent.keys().map(String::as_str)
    }

    /// The units above `unit`, nearest first; empty for a top-level or unknown unit.
    #[must_use]
    pub fn ancestors(&self, unit: &str) -> Vec<String> {
        let mut out = Vec::new();
        let mut at = self.parent_of(unit);
        while let Some(u) = at {
            out.push(u.to_owned());
            at = self.parent_of(u);
        }
        out
    }

    /// The units below `unit`, at any depth; `unit` itself is not included.
    #[must_use]
    pub fn descendants(&self, unit: &str) -> BTreeSet<String> {
        let mut out = BTreeSet::new();
        let mut stack: Vec<&str> = vec![unit];
        while let Some(u) = stack.pop() {
            for c in self.children.get(u).into_iter().flatten() {
                if out.insert(c.clone()) {
                    stack.push(c);
                }
            }
        }
        out
    }

    /// Whether hanging `unit` under `new_parent` would make a cycle: the new parent is the unit
    /// itself or one of its descendants.
    #[must_use]
    pub fn would_cycle(&self, unit: &str, new_parent: &str) -> bool {
        unit == new_parent || self.descendants(unit).contains(new_parent)
    }
}
