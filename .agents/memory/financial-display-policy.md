---
name: Profit and loss presentation
description: User requirements for signed, colour-coded financial results.
---

A loss should appear with a minus sign and in red; profit should appear with a plus sign and in green.

**Why:** The user explicitly requested consistent visual meaning for results throughout the website.

**How to apply:** Preserve this convention in every trading workspace, results summary, transaction display, and currency-converted P/L. Zero and pending values should not be presented as profits or losses.

Contract value means the stake actually paid for that trade, including martingale changes. P/L means only the net gain or loss, not the account balance, gross payout, or stake.

**Why:** The user explicitly distinguished contract value from net results and expects the balance to update during trading.

**How to apply:** Keep paid stake and signed net P/L separate in per-trade results and summaries; obtain balances from Deriv rather than inferring them from local profits.

Never treat Deriv's quoted contract payout as actual proceeds on a losing contract.

**Why:** A contract can retain its potential winning payout after it loses. Subtracting stake from that quote can falsely display a gain for a confirmed loss.

**How to apply:** Resolve settlement from the actual sale proceeds or broker net result; a confirmed binary loss without either uses negative paid stake. Include a loss fixture with a nonzero winning quote, not only zero-payout loss fixtures.
