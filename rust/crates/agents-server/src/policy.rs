//! What the platform may refuse: the hook the cloud edition fills in.
//!
//! The open-source edition has no plans and no model catalogue, so it allows everything
//! ([`AllowAll`]). The cloud edition replaces it with a policy that refuses what the
//! organisation's plan does not include: the plan cap on the number of assistants, and the
//! models the plan may use. The hook runs before the write, so a refused request leaves no row
//! behind.
//!
//! The same goes for a chat: the model policy, the usage and the credits belong to the cloud
//! edition, so [`ChatMeter`] is the hook it fills in. The open-source edition allows every chat
//! and records nothing ([`AllowAllChat`]).
//!
//! The traits live here, in the composition root, because it is the caller's business: the
//! cloud crate implements them and passes them to [`crate::AppState`].

use agents_core::org::OrgRole;
use agents_llm::types::Usage;

use crate::http::ApiError;

/// What the request wants to do to an assistant.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PolicyAction {
    Create,
    Update,
}

/// What the policy gets to look at.
#[derive(Debug, Clone, Copy)]
pub struct PolicyContext<'a> {
    /// Who is asking.
    pub user_id: &'a str,
    /// The organisation the assistant belongs to. `None` for a built-in assistant, which
    /// belongs to no organisation.
    pub organization_id: Option<&'a str>,
    /// The caller's role in that organisation.
    pub role: OrgRole,
    /// What the request does.
    pub action: PolicyAction,
    /// The name the assistant has (or would have).
    pub name: &'a str,
    /// The model the assistant uses, when the request sets one.
    pub model: Option<&'a str>,
    /// How many assistants the organisation has. A plan cap counts them.
    pub assistant_count: usize,
}

/// The plan limits and the model policy of a deployment.
///
/// Both hooks answer with the error the caller must see: a 403 `permission_denied` when the
/// caller's role or plan does not allow it, including when the plan has to be paid for first
/// (docs/conventions.md does not use 402).
pub trait AssistantPolicy: Send + Sync + std::fmt::Debug {
    /// Called before an assistant is created.
    fn check_create(&self, ctx: &PolicyContext<'_>) -> Result<(), ApiError>;

    /// Called before an assistant is updated.
    fn check_update(&self, ctx: &PolicyContext<'_>) -> Result<(), ApiError>;
}

/// The open-source policy: nothing is refused.
#[derive(Debug, Clone, Copy, Default)]
pub struct AllowAll;

impl AssistantPolicy for AllowAll {
    fn check_create(&self, _ctx: &PolicyContext<'_>) -> Result<(), ApiError> {
        Ok(())
    }

    fn check_update(&self, _ctx: &PolicyContext<'_>) -> Result<(), ApiError> {
        Ok(())
    }
}

/// The model the open-source wizard runs on: `WIZARD_MODEL_ID` of the old service. A
/// non-reasoning model, because the wizard's flow needs terse tool calling.
pub const WIZARD_MODEL_ID: &str = "anthropic/claude-sonnet-4.6";

/// One model the wizard may offer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WizardModelEntry {
    /// The model id the proposal carries.
    pub id: String,
    /// The name the wizard shows the model under.
    pub name: String,
    /// Whether the model can call tools. The wizard's flow needs it.
    pub function_calling: bool,
    /// The context window, when the deployment knows it.
    pub ctx: Option<u32>,
}

/// The model the wizard runs on and the catalogue it offers.
///
/// The open-source edition has no model catalogue and no plans, so its default runs on
/// [`WIZARD_MODEL_ID`] and offers the house models the port knows
/// ([`ConfiguredWizard`]). The cloud edition replaces it: the model the wizard runs on, the
/// models an organisation may use and the plan that organisation is on are its business
/// (differences.md row 29).
pub trait WizardModel: Send + Sync + std::fmt::Debug {
    /// The model the wizard itself runs on.
    fn model_id(&self) -> &str;

    /// Whether the organisation is on the free plan. The prompt's model rule and the
    /// catalogue depend on it.
    fn is_free_plan(&self, organization_id: &str) -> bool;

    /// The models the wizard may offer to this organisation.
    fn models(&self, organization_id: &str) -> Vec<WizardModelEntry>;
}

/// The open-source wizard model: the model it runs on, and the house models the port knows
/// as the catalogue.
///
/// The open-source edition has no plans, so an organisation is never on the free plan here
/// and the prompt asks for a paid house model. The cloud edition brings its own.
#[derive(Debug, Clone)]
pub struct ConfiguredWizard {
    model_id: String,
    models: Vec<WizardModelEntry>,
}

impl ConfiguredWizard {
    /// A wizard that runs on `model_id` and offers the house models when they can be
    /// served: the old service offered them only when `MINIMAX_API_KEY` was set.
    #[must_use]
    pub fn new(model_id: impl Into<String>, house_models_served: bool) -> Self {
        Self {
            model_id: model_id.into(),
            models: if house_models_served {
                house_model_entries()
            } else {
                Vec::new()
            },
        }
    }

    /// A wizard that runs on `model_id` and offers exactly these models.
    #[must_use]
    pub fn with_models(model_id: impl Into<String>, models: Vec<WizardModelEntry>) -> Self {
        Self {
            model_id: model_id.into(),
            models,
        }
    }
}

impl WizardModel for ConfiguredWizard {
    fn model_id(&self) -> &str {
        &self.model_id
    }

    fn is_free_plan(&self, _organization_id: &str) -> bool {
        false
    }

    fn models(&self, _organization_id: &str) -> Vec<WizardModelEntry> {
        self.models.clone()
    }
}

/// The house models as the wizard offers them.
///
/// The display names live with the model catalogue, which the cloud edition owns; here the
/// name is the last part of the id (`rantai/nano` is "Nano").
fn house_model_entries() -> Vec<WizardModelEntry> {
    agents_llm::provider::house_models()
        .iter()
        .map(|(id, _, _)| WizardModelEntry {
            id: (*id).to_owned(),
            name: id.rsplit('/').next().unwrap_or(id).to_owned(),
            function_calling: true,
            ctx: None,
        })
        .collect()
}

/// What the meter gets to look at.
#[derive(Debug, Clone, Copy)]
pub struct ChatContext<'a> {
    /// Who is asking.
    pub user_id: &'a str,
    /// The organisation the chat happens in, when it has one.
    pub organization_id: Option<&'a str>,
    /// The assistant the chat is with.
    pub assistant_id: Option<&'a str>,
    /// The model the chat will use.
    pub model: &'a str,
}

/// What a chat may cost: the model policy, the usage and the credits.
///
/// The open-source edition has none of the three, so the default allows every chat and records
/// nothing. The cloud edition refuses a chat its plan does not pay for before the model is
/// called, and deducts the credits afterwards.
pub trait ChatMeter: Send + Sync + std::fmt::Debug {
    /// Called before the model is called.
    ///
    /// A refusal is a 403 `permission_denied` (docs/conventions.md does not use 402).
    fn check(&self, ctx: &ChatContext<'_>) -> Result<(), ApiError>;

    /// Called after the answer, with what the model reported it cost.
    fn record(&self, ctx: &ChatContext<'_>, usage: Usage);
}

/// The open-source meter: nothing is refused and nothing is recorded.
#[derive(Debug, Clone, Copy, Default)]
pub struct AllowAllChat;

impl ChatMeter for AllowAllChat {
    fn check(&self, _ctx: &ChatContext<'_>) -> Result<(), ApiError> {
        Ok(())
    }

    fn record(&self, _ctx: &ChatContext<'_>, _usage: Usage) {}
}
