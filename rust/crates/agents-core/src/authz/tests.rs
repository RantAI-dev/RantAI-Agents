use std::collections::BTreeSet;

use super::*;

const ORG: &str = "org_a";

/// company ─┬─ sales ─── emea ─── emea_north
///          └─ eng ──┬── web
///                   └── infra
fn tree() -> UnitTree {
    let pairs = [
        ("company", None),
        ("sales", Some("company")),
        ("emea", Some("sales")),
        ("emea_north", Some("emea")),
        ("eng", Some("company")),
        ("web", Some("eng")),
        ("infra", Some("eng")),
    ];
    UnitTree::new(
        pairs
            .into_iter()
            .map(|(u, p)| (u.to_owned(), p.map(str::to_owned))),
    )
    .unwrap_or_default()
}

fn principal(user: &str, role: OrgRole, units: &[(&str, bool)]) -> Principal {
    let units = units
        .iter()
        .map(|(u, lead)| UnitMembership {
            unit_id: (*u).to_owned(),
            is_lead: *lead,
        })
        .collect();
    Principal::new(user, ORG, role, false, units, &tree())
}

fn subject(kind: SubjectType, id: &str) -> Subject {
    Subject {
        kind,
        id: id.to_owned(),
    }
}

fn agent(
    org: Option<&str>,
    built_in: bool,
    grants: &[(SubjectType, &str, GrantLevel)],
) -> AgentRef {
    AgentRef {
        organization_id: org.map(str::to_owned),
        is_built_in: built_in,
        grants: grants
            .iter()
            .map(|(k, id, level)| Grant {
                subject: subject(*k, id),
                level: *level,
            })
            .collect(),
    }
}

#[test]
fn the_role_table_is_the_one_in_the_design() {
    use OrgRole::{Admin, Member, Owner, Viewer};
    use Permission as P;
    // (permission, owner, admin, member, viewer), §3.2.
    let table = [
        (P::OrgManage, true, false, false, false),
        (P::OrgMembersManage, true, true, false, false),
        (P::OrgUnitsManage, true, true, false, false),
        (P::OrgSsoManage, true, true, false, false),
        (P::OrgAuditRead, true, true, false, false),
        (P::AgentsCreate, true, true, false, false),
        (P::AgentsManage, true, true, false, false),
        (P::AgentsUse, true, true, true, true),
        (P::ApiKeysManage, true, true, false, false),
        (P::ChatsShare, true, true, true, false),
        (P::ChatsReadShared, true, true, true, true),
    ];
    assert_eq!(table.len(), Permission::ALL.len());
    for (p, owner, admin, member, viewer) in table {
        assert_eq!(role_has(Owner, p), owner, "owner {}", p.as_str());
        assert_eq!(role_has(Admin, p), admin, "admin {}", p.as_str());
        assert_eq!(role_has(Member, p), member, "member {}", p.as_str());
        assert_eq!(role_has(Viewer, p), viewer, "viewer {}", p.as_str());
    }
    assert!(!role_permissions(Member).contains(&P::AgentsCreate));
    assert_eq!(role_permissions(Owner).len(), Permission::ALL.len());
}

#[test]
fn agent_access_cases() {
    use GrantLevel::{Manage, Use};
    use OrgRole::{Admin, Member, Owner, Viewer};
    use SubjectType::{Org, Unit, User};
    let none: &[(SubjectType, &str, GrantLevel)] = &[];
    // (case, principal, agent, use, manage)
    let cases: Vec<(&str, Principal, AgentRef, Decision, Decision)> = vec![
        (
            "built-in, member",
            principal("u", Member, &[]),
            agent(None, true, none),
            Decision::Allow,
            Decision::Deny,
        ),
        (
            "org-less, not built in",
            principal("u", Admin, &[]),
            agent(None, false, none),
            Decision::Deny,
            Decision::Deny,
        ),
        (
            "new agent, no grants, member",
            principal("u", Member, &[("web", false)]),
            agent(Some(ORG), false, none),
            Decision::Deny,
            Decision::Deny,
        ),
        (
            "new agent, no grants, admin",
            principal("u", Admin, &[]),
            agent(Some(ORG), false, none),
            Decision::Allow,
            Decision::Allow,
        ),
        (
            "new agent, no grants, owner",
            principal("u", Owner, &[]),
            agent(Some(ORG), false, none),
            Decision::Allow,
            Decision::Allow,
        ),
        (
            "direct user grant",
            principal("u", Viewer, &[]),
            agent(Some(ORG), false, &[(User, "u", Use)]),
            Decision::Allow,
            Decision::Deny,
        ),
        (
            "someone else's user grant",
            principal("u", Member, &[]),
            agent(Some(ORG), false, &[(User, "v", Manage)]),
            Decision::Deny,
            Decision::Deny,
        ),
        (
            "org grant",
            principal("u", Viewer, &[]),
            agent(Some(ORG), false, &[(Org, ORG, Use)]),
            Decision::Allow,
            Decision::Deny,
        ),
        (
            "another org named in a grant",
            principal("u", Member, &[]),
            agent(Some(ORG), false, &[(Org, "org_b", Use)]),
            Decision::Deny,
            Decision::Deny,
        ),
        (
            "grant to own team",
            principal("u", Member, &[("web", false)]),
            agent(Some(ORG), false, &[(Unit, "web", Use)]),
            Decision::Allow,
            Decision::Deny,
        ),
        (
            "grant to the department above",
            principal("u", Member, &[("web", false)]),
            agent(Some(ORG), false, &[(Unit, "eng", Use)]),
            Decision::Allow,
            Decision::Deny,
        ),
        (
            "grant to the root reaches every depth",
            principal("u", Member, &[("emea_north", false)]),
            agent(Some(ORG), false, &[(Unit, "company", Use)]),
            Decision::Allow,
            Decision::Deny,
        ),
        (
            "team grant never reaches the department",
            principal("u", Member, &[("eng", false)]),
            agent(Some(ORG), false, &[(Unit, "web", Use)]),
            Decision::Deny,
            Decision::Deny,
        ),
        (
            "sibling team",
            principal("u", Member, &[("infra", false)]),
            agent(Some(ORG), false, &[(Unit, "web", Use)]),
            Decision::Deny,
            Decision::Deny,
        ),
        (
            "other branch",
            principal("u", Member, &[("emea", false)]),
            agent(Some(ORG), false, &[(Unit, "eng", Use)]),
            Decision::Deny,
            Decision::Deny,
        ),
        (
            "unknown unit membership is ignored",
            principal("u", Member, &[("ghost", false)]),
            agent(Some(ORG), false, &[(Unit, "ghost", Use)]),
            Decision::Deny,
            Decision::Deny,
        ),
        (
            "manage grant through a unit",
            principal("u", Member, &[("emea", false)]),
            agent(Some(ORG), false, &[(Unit, "sales", Manage)]),
            Decision::Allow,
            Decision::Allow,
        ),
        (
            "another org's agent, admin",
            principal("u", Admin, &[]),
            agent(Some("org_b"), false, &[(User, "u", Manage)]),
            Decision::NotFound,
            Decision::NotFound,
        ),
    ];
    for (name, p, a, want_use, want_manage) in cases {
        assert_eq!(
            authorize(&p, Permission::AgentsUse, &Resource::Agent(&a)),
            want_use,
            "use: {name}"
        );
        assert_eq!(
            authorize(&p, Permission::AgentsManage, &Resource::Agent(&a)),
            want_manage,
            "manage: {name}"
        );
    }
}

#[test]
fn a_built_in_is_managed_only_by_a_platform_admin() {
    let built_in = agent(None, true, &[]);
    let mut p = principal("u", OrgRole::Owner, &[]);
    assert_eq!(
        authorize(&p, Permission::AgentsManage, &Resource::Agent(&built_in)),
        Decision::Deny
    );
    p.is_platform_admin = true;
    assert_eq!(
        authorize(&p, Permission::AgentsManage, &Resource::Agent(&built_in)),
        Decision::Allow
    );
}

#[test]
fn chat_share_cases() {
    use OrgRole::{Admin, Member, Viewer};
    use SubjectType::{Org, Unit, User};
    let chat = |owner: &str, shares: &[(SubjectType, &str)]| ChatRef {
        organization_id: ORG.to_owned(),
        owner_id: owner.to_owned(),
        shares: shares.iter().map(|(k, id)| subject(*k, id)).collect(),
    };
    // (case, principal, chat, read, share)
    let cases = vec![
        (
            "own chat",
            principal("u", Member, &[]),
            chat("u", &[]),
            Decision::Allow,
            Decision::Allow,
        ),
        (
            "own chat, viewer may not share",
            principal("u", Viewer, &[]),
            chat("u", &[]),
            Decision::Allow,
            Decision::Deny,
        ),
        (
            "someone else's, not shared",
            principal("u", Member, &[]),
            chat("v", &[]),
            Decision::Deny,
            Decision::Deny,
        ),
        (
            "admin does not read unshared chats",
            principal("u", Admin, &[]),
            chat("v", &[]),
            Decision::Deny,
            Decision::Allow,
        ),
        (
            "shared with the user",
            principal("u", Viewer, &[]),
            chat("v", &[(User, "u")]),
            Decision::Allow,
            Decision::Deny,
        ),
        (
            "shared with the org",
            principal("u", Member, &[]),
            chat("v", &[(Org, ORG)]),
            Decision::Allow,
            Decision::Deny,
        ),
        (
            "shared with the department above",
            principal("u", Member, &[("infra", false)]),
            chat("v", &[(Unit, "eng")]),
            Decision::Allow,
            Decision::Deny,
        ),
        (
            "shared with a team below",
            principal("u", Member, &[("eng", false)]),
            chat("v", &[(Unit, "infra")]),
            Decision::Deny,
            Decision::Deny,
        ),
    ];
    for (name, p, c, want_read, want_share) in cases {
        assert_eq!(
            authorize(&p, Permission::ChatsReadShared, &Resource::Chat(&c)),
            want_read,
            "read: {name}"
        );
        assert_eq!(
            authorize(&p, Permission::ChatsShare, &Resource::Chat(&c)),
            want_share,
            "share: {name}"
        );
    }
    let mut other = chat("u", &[]);
    other.organization_id = "org_b".to_owned();
    let p = principal("u", Admin, &[]);
    assert_eq!(
        authorize(&p, Permission::ChatsReadShared, &Resource::Chat(&other)),
        Decision::NotFound
    );
}

#[test]
fn team_lead_scope_cases() {
    let lead = principal("u", OrgRole::Member, &[("eng", true), ("emea", false)]);
    let unit = |id| Resource::Unit {
        organization_id: ORG,
        unit_id: id,
    };
    for (id, want) in [
        ("eng", Decision::Allow),
        ("web", Decision::Allow),
        ("infra", Decision::Allow),
        ("company", Decision::Deny),
        ("sales", Decision::Deny),
        ("emea", Decision::Deny), // a plain member there, not its lead
    ] {
        assert_eq!(
            authorize(&lead, Permission::OrgUnitsManage, &unit(id)),
            want,
            "{id}"
        );
    }
    // Lead scope is only units: no top-level creation, no other permission.
    let org = Resource::Org {
        organization_id: ORG,
    };
    assert_eq!(
        authorize(&lead, Permission::OrgUnitsManage, &org),
        Decision::Deny
    );
    assert_eq!(
        authorize(&lead, Permission::OrgMembersManage, &unit("eng")),
        Decision::Deny
    );
    let admin = principal("a", OrgRole::Admin, &[]);
    assert_eq!(
        authorize(&admin, Permission::OrgUnitsManage, &unit("sales")),
        Decision::Allow
    );
    let elsewhere = Resource::Unit {
        organization_id: "org_b",
        unit_id: "eng",
    };
    assert_eq!(
        authorize(&lead, Permission::OrgUnitsManage, &elsewhere),
        Decision::NotFound
    );
}

#[test]
fn org_resources_follow_the_role_table_and_hide_other_orgs() {
    for role in [
        OrgRole::Owner,
        OrgRole::Admin,
        OrgRole::Member,
        OrgRole::Viewer,
    ] {
        let p = principal("u", role, &[]);
        for perm in Permission::ALL {
            let want = Decision::from_bool(role_has(role, perm));
            assert_eq!(
                authorize(
                    &p,
                    perm,
                    &Resource::Org {
                        organization_id: ORG
                    }
                ),
                want
            );
            assert_eq!(
                authorize(
                    &p,
                    perm,
                    &Resource::Org {
                        organization_id: "org_b"
                    }
                ),
                Decision::NotFound
            );
        }
    }
}

#[test]
fn a_tree_rejects_cycles_and_dangling_parents() {
    let pair = |u: &str, p: Option<&str>| (u.to_owned(), p.map(str::to_owned));
    assert!(matches!(
        UnitTree::new([pair("a", Some("a"))]),
        Err(TreeError::Cycle(_))
    ));
    assert!(matches!(
        UnitTree::new([
            pair("a", Some("b")),
            pair("b", Some("c")),
            pair("c", Some("a"))
        ]),
        Err(TreeError::Cycle(_))
    ));
    assert!(matches!(
        UnitTree::new([pair("a", Some("z"))]),
        Err(TreeError::UnknownParent { .. })
    ));
    let t = tree();
    assert_eq!(t.ancestors("emea_north"), vec!["emea", "sales", "company"]);
    assert!(t.would_cycle("sales", "emea_north"));
    assert!(t.would_cycle("sales", "sales"));
    assert!(!t.would_cycle("emea", "eng"));
}

/// A small deterministic generator: no new crates, and a failing seed is printed and replayable.
struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }

    fn below(&mut self, n: usize) -> usize {
        usize::try_from(self.next() % (n.max(1) as u64)).unwrap_or(0)
    }
}

/// A random forest: each unit's parent is an earlier unit or none.
fn random_tree(rng: &mut Rng, n: usize) -> UnitTree {
    let pairs: Vec<(String, Option<String>)> = (0..n)
        .map(|i| {
            let parent = (i > 0 && rng.below(5) != 0).then(|| format!("u{}", rng.below(i)));
            (format!("u{i}"), parent)
        })
        .collect();
    UnitTree::new(pairs).unwrap_or_default()
}

#[test]
fn property_descendants_are_never_ancestors() {
    for seed in 1..=300_u64 {
        let mut rng = Rng(seed);
        let n = 1 + rng.below(30);
        let t = random_tree(&mut rng, n);
        for u in t.units() {
            let down = t.descendants(u);
            let up: BTreeSet<String> = t.ancestors(u).into_iter().collect();
            assert!(down.is_disjoint(&up), "seed {seed}: {u}");
            assert!(
                !down.contains(u) && !up.contains(u),
                "seed {seed}: {u} is its own relative"
            );
            for d in &down {
                assert!(
                    t.ancestors(d).iter().any(|a| a == u),
                    "seed {seed}: {d} below {u}"
                );
            }
        }
    }
}

#[test]
fn property_a_unit_grant_reaches_exactly_the_subtree() {
    for seed in 1..=300_u64 {
        let mut rng = Rng(seed);
        let n = 1 + rng.below(25);
        let t = random_tree(&mut rng, n);
        let units: Vec<String> = t.units().map(str::to_owned).collect();
        let Some(granted) = units.get(rng.below(units.len())) else {
            continue;
        };
        let a = AgentRef {
            organization_id: Some(ORG.to_owned()),
            is_built_in: false,
            grants: vec![Grant {
                subject: subject(SubjectType::Unit, granted),
                level: GrantLevel::Use,
            }],
        };
        let subtree = t.descendants(granted);
        for u in &units {
            let p = Principal::new(
                "x",
                ORG,
                OrgRole::Member,
                false,
                vec![UnitMembership {
                    unit_id: u.clone(),
                    is_lead: false,
                }],
                &t,
            );
            let want = u == granted || subtree.contains(u);
            assert_eq!(
                can_use_agent(&p, &a),
                want,
                "seed {seed}: grant to {granted}, user in {u}"
            );
            // In particular, a grant never reaches a unit above the granted one.
            if t.ancestors(granted).contains(u) {
                assert!(!can_use_agent(&p, &a), "seed {seed}: reached parent {u}");
            }
        }
    }
}

#[test]
fn property_would_cycle_agrees_with_rebuilding_the_tree() {
    for seed in 1..=200_u64 {
        let mut rng = Rng(seed);
        let n = 2 + rng.below(20);
        let t = random_tree(&mut rng, n);
        let units: Vec<String> = t.units().map(str::to_owned).collect();
        let (Some(u), Some(p)) = (units.get(rng.below(n)), units.get(rng.below(n))) else {
            continue;
        };
        let moved = units.iter().map(|x| {
            let parent = if x == u {
                Some(p.clone())
            } else {
                t.parent_of(x).map(str::to_owned)
            };
            (x.clone(), parent)
        });
        assert_eq!(
            t.would_cycle(u, p),
            UnitTree::new(moved).is_err(),
            "seed {seed}: {u} under {p}"
        );
    }
}
