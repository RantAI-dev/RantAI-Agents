# Insurance Fraud Detection Guide

## Overview

Insurance fraud costs the industry an estimated $80 billion annually. This guide outlines the fraud detection methodology used by our automated claims analysis system, including risk indicators, scoring methodology, and investigation procedures.

## Types of Insurance Fraud

### Hard Fraud (Deliberate)
Intentionally planned schemes to defraud insurers:
- **Staged Accidents**: Coordinated collisions with multiple participants, often involving specific body shops or medical providers
- **Arson**: Deliberately setting fire to property to collect insurance proceeds
- **Faked Theft**: Reporting vehicle or property theft when items were hidden, sold, or destroyed by the claimant
- **Phantom Injuries**: Fabricating injuries that never occurred, often with complicit medical providers
- **Identity Fraud**: Using false identities to obtain policies or file claims

### Soft Fraud (Opportunistic)
Exaggerating legitimate claims or misrepresenting facts:
- **Inflated Claims**: Padding repair estimates or adding pre-existing damage to legitimate claims
- **Misrepresented Facts**: Lying about circumstances, timeline, or details of an incident
- **Pre-existing Damage**: Including prior damage in a new claim
- **Multiple Submissions**: Filing the same loss with multiple insurers
- **Exaggerated Injuries**: Claiming more severe injuries than actually sustained

## Red Flags and Indicators

### Policyholder Behavior Red Flags
- New policy with immediate large claim (less than 6 months tenure)
- History of frequent claims across multiple policies or insurers
- Reluctance to provide documentation or cooperate with investigation
- Changing story details between interviews
- Overly detailed narrative in some areas but vague in critical details
- Pressure for quick settlement
- Providing only copies of documents, never originals

### Claim Characteristics Red Flags
- Claims filed shortly after policy inception or coverage increase
- No police report for significant incidents (major damage, injury, theft)
- No witnesses to the incident despite occurring in public areas
- Incident occurred in isolated location or late at night
- Claim amount inconsistencies between reported components
- Total claim amount does not match sum of individual components (injury + property + vehicle)
- Round-number claim amounts suggesting fabrication

### Financial Indicators
- Claims just under investigation thresholds
- Disproportionate injury claims relative to property damage
- Repair estimates significantly above market rates
- Multiple small claims pattern (staying below review thresholds)
- Premium payment irregularities
- Recent coverage increases before the loss

### Vehicle-Specific Indicators
- Single vehicle incidents with high claim amounts
- Vehicle recently purchased or with recent coverage increase
- Claimed total loss on vehicle with existing mechanical issues
- Body shop recommended by claimant has prior fraud associations
- Multiple occupants all claiming injuries

## Fraud Risk Scoring Methodology

### Risk Score Calculation (0-100)

The automated system calculates a composite risk score using three analysis methods:

**1. AI Narrative Analysis (30% weight)**
- Analyzes claim description text for internal inconsistencies
- Detects suspicious language patterns and emotional manipulation
- Identifies implausible details or timeline issues
- Flags missing critical details

**2. Rule-Based Scoring (40% weight)**
- High claim amount (>$50K): +15 points
- Very high claim amount (>$100K): +10 additional points
- No police report for non-minor incident: +20 points
- Customer tenure less than 6 months: +15 points
- New customer with large claim (>$30K): +10 additional points
- No witnesses: +10 points
- Single vehicle with high claim (>$40K): +10 points
- Injury claim without police report: +15 points
- Claim component amounts do not sum to total (>$1K discrepancy): +15 points

**3. AI Pattern Matching (30% weight)**
- Compares claim against known fraud pattern database
- Identifies similarities to staged accident patterns
- Detects phantom injury indicators
- Flags organized fraud ring characteristics

### Risk Level Thresholds

| Score Range | Risk Level | Action |
|-------------|-----------|--------|
| 0 - 29 | Low Risk | Auto-approve for standard processing |
| 30 - 65 | Medium Risk | Route to fraud analyst for manual review |
| 66 - 100 | High Risk | Block claim and escalate to SIU |

## Investigation Procedures

### Low Risk Claims (Auto-Approve)
- Processed through standard claims pipeline
- Subject to random audit sampling (5% of approved claims)
- Automated documentation and compliance logging
- Standard payment processing timeline

### Medium Risk Claims (Analyst Review)
- Assigned to fraud analyst queue within 2 hours
- 48-hour review SLA from assignment
- Analyst actions:
  - Review all three analysis reports (narrative, rules, patterns)
  - Request additional documentation from claimant if needed
  - Conduct phone interview with claimant
  - Verify incident details with third parties
  - Cross-reference with claims database
- Decision outcomes: Approve, Deny, or Escalate to SIU
- All review actions documented in case file

### High Risk Claims (SIU Escalation)
- Immediate claim hold placed on payment
- Assigned to Special Investigations Unit within 1 hour
- Full investigation protocol activated:
  - Scene investigation and reconstruction
  - Witness interviews and statements
  - Medical record verification
  - Financial background analysis
  - Surveillance if warranted
  - External vendor verification (e.g., independent medical examination)
- Law enforcement coordination for suspected criminal fraud
- Typical investigation timeline: 30-90 days
- Outcomes: Approve with documentation, Deny with evidence, or Refer for prosecution

## Compliance and Regulatory Requirements

### Reporting Obligations
- State insurance fraud bureau reporting for confirmed fraud
- National Insurance Crime Bureau (NICB) referral for suspected organized fraud
- Suspicious Activity Reports (SARs) for claims involving potential money laundering
- Annual fraud statistics reporting to state regulators

### Record Retention
- All fraud analysis reports retained for minimum 7 years
- Investigation case files retained for 10 years
- Automated scoring logs retained indefinitely for model improvement
- Claimant communication records retained per state requirements

### Privacy and Data Protection
- Claimant data handled in compliance with state privacy laws
- Investigation information shared only on need-to-know basis
- Third-party data access governed by vendor agreements
- Right to explanation: claimants may request basis for adverse decisions
