# CISD Journal v1.0.0 — Installation & First Setup

## Installation

1. Run `CISD Journal Setup.exe`.
2. Choose an installation folder if required.
3. Finish installation.
4. Launch CISD Journal from Desktop or Start Menu.

## First Setup Wizard

### Step 1 — Account
Create or select FundingPips / FundedNext account.

Enter:
- Initial Capital
- Current Balance
- Currency
- Challenge Phase
- Profit Target
- Daily Loss Limit
- Maximum Drawdown

### Step 2 — JForex Signals
Choose:
`HigherTF_Signals.csv`

Typical path:
`C:\Program Files\JForex4\Strategies\files\HigherTF_Signals.csv`

### Step 3 — FundedNext Reports
Choose a local folder where FundedNext CSV reports will be saved. Any new CSV saved in this folder is checked for new Ticket IDs.

### Step 4 — MT5 Terminal
Choose the FundingPips or FundedNext MT5 desktop shortcut (`.lnk`) or terminal executable (`.exe`). This only opens the local terminal; it never submits or changes a trade.

### Step 5 — FMP News (optional)
Choose `FMP Free` and paste the API key into Settings. The key is stored locally and is not uploaded to GitHub.

### Step 6 — FundingPips Shared Dashboard (optional)
Paste the Enable Sharing URL only if you choose to use it. Follow FundingPips policy before enabling periodic refresh.

## Safety
- Create an Export Backup before a major reset.
- Use Restore Backup to recover a prior local data snapshot.
- Do not share API keys, passwords, or MT5 login credentials.
