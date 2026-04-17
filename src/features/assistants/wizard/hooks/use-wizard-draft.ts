"use client"

import { useReducer, useCallback } from "react"
import type {
  WizardDraft,
  ProposeAgentInput,
  RefineAgentInput,
  Uncertainty,
} from "../schema"

export interface WizardState {
  draft: WizardDraft
  uncertainty: Uncertainty
  dropped: Record<string, string[]>
}

type Action =
  | { type: "apply-proposal"; payload: ProposeAgentInput }
  | { type: "apply-refinement"; payload: RefineAgentInput }
  | { type: "user-edit"; field: keyof WizardDraft; value: unknown }
  | { type: "set-dropped"; dropped: Record<string, string[]> }
  | { type: "reset" }

const INITIAL: WizardState = {
  draft: {
    selectedToolIds: [],
    selectedSkillIds: [],
    selectedMcpServerIds: [],
    selectedWorkflowIds: [],
    knowledgeBaseGroupIds: [],
  },
  uncertainty: {},
  dropped: {},
}

function reducer(state: WizardState, action: Action): WizardState {
  switch (action.type) {
    case "apply-proposal": {
      const { uncertainty, reasoning: _r, ...rest } = action.payload
      const nextUncertainty: Uncertainty = { ...state.uncertainty }
      for (const [k, v] of Object.entries(uncertainty)) {
        nextUncertainty[k] = v
      }
      return {
        ...state,
        draft: { ...state.draft, ...rest },
        uncertainty: nextUncertainty,
      }
    }
    case "apply-refinement": {
      const { uncertainty, ...rest } = action.payload
      return {
        ...state,
        draft: { ...state.draft, ...rest },
        uncertainty: uncertainty
          ? { ...state.uncertainty, ...uncertainty }
          : state.uncertainty,
      }
    }
    case "user-edit":
      return {
        ...state,
        draft: { ...state.draft, [action.field]: action.value },
        uncertainty: { ...state.uncertainty, [action.field]: "locked" },
      }
    case "set-dropped":
      return { ...state, dropped: action.dropped }
    case "reset":
      return INITIAL
  }
}

export function useWizardDraft() {
  const [state, dispatch] = useReducer(reducer, INITIAL)

  const applyProposal = useCallback(
    (p: ProposeAgentInput) => dispatch({ type: "apply-proposal", payload: p }),
    []
  )
  const applyRefinement = useCallback(
    (p: RefineAgentInput) => dispatch({ type: "apply-refinement", payload: p }),
    []
  )
  const userEdit = useCallback(
    <K extends keyof WizardDraft>(field: K, value: WizardDraft[K]) =>
      dispatch({ type: "user-edit", field, value }),
    []
  )
  const setDropped = useCallback(
    (dropped: Record<string, string[]>) =>
      dispatch({ type: "set-dropped", dropped }),
    []
  )
  const reset = useCallback(() => dispatch({ type: "reset" }), [])

  return { state, applyProposal, applyRefinement, userEdit, setDropped, reset }
}
