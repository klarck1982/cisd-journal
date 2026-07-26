# User Testing Script

## Goal
Validate whether a daily trader can complete the core CISD Journal workflow without guidance.

## Recommended participant profile
- Daily trader
- Uses MT5 or prop-firm accounts
- Understands signals / sessions / news
- Has at least basic journaling experience

---

## Scenario 1 — First setup
### Task
- Select the CISD CSV file
- Configure news provider
- Configure MT5 shortcut
- Confirm account context is understandable

### Observe
- How long it takes to understand where setup lives
- Whether the user notices missing account/risk configuration paths
- Where they hesitate first

### Success criteria
- User finds CSV setup within 30–60 seconds
- User understands where news and terminal setup are located

---

## Scenario 2 — Live signal review
### Task
- Open signals page
- Find a fresh signal
- Mark one as entered
- Mark one as missed with a reason

### Observe
- Whether the actions are instantly understandable
- Whether the user expects the trade form to open after “Entered”
- Whether the missed-reason modal feels sufficient

### Success criteria
- User can classify signals without explanation
- User understands missed-reason capture immediately

---

## Scenario 3 — Manual journaling
### Task
- Add one fully manual trade with no signal link
- Add one CISD-linked trade

### Observe
- Whether the optional nature of signal linking is clear
- Whether the user understands how the trade will later appear in analytics

### Success criteria
- User can save both trade types confidently

---

## Scenario 4 — Backtest session
### Task
- Create a backtest session from the same CSV
- Use date range + session + symbol + TF
- Review at least 3 signals

### Observe
- Whether filter meaning is obvious
- Whether prompt-driven review feels awkward
- Whether session context is easy to understand

### Success criteria
- User understands the mental model of historical signal extraction
- User can review signals without confusion

---

## Scenario 5 — Analytics reading
### Task
- Change filters
- Explain what the dashboard is currently showing
- Identify best source or strongest session

### Observe
- Whether users understand event aggregation
- Whether KPI cards and breakdowns are self-explanatory

### Success criteria
- User can explain filtered results back in their own words

---

## Scenario 6 — Data confidence
### Task
- Visit data sources page
- Explain what imported successfully and what needs attention

### Observe
- Whether source health cards are actionable enough
- Whether diagnostics feel understandable

### Success criteria
- User correctly identifies configured vs missing sources

---

## Suggested rating dimensions
Rate each task 1–5:
- clarity
- speed
- confidence
- trust in result
- visual comfort

---

## Recommended output after real test sessions
For each participant capture:
- completed tasks
- blocked tasks
- time to completion
- confusion points
- quotes
- suggested UI fix
- severity (P0/P1/P2)
