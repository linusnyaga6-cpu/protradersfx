---
name: Bot risk-limit enforcement
description: Durable constraints for sequential bot runs and configured risk thresholds.
---

Live bot execution must evaluate cumulative settled profit after every run and honor the trader's configured Take Profit, Stop Loss, requested run count, explicit Stop Bot action, and any configured consecutive-loss limit. Every surface presented as a bot must use this live execution contract; it must not silently fall back to review-only toggles.

**Why:** A hidden run limit could end a bot around a smaller loss or profit than the trader configured, making a Stop Loss such as 500 behave as if it were much lower; a configured consecutive-loss rule is likewise part of the trader's explicit risk contract.

**How to apply:** Keep the current contract running until it settles when Stop Bot is requested, append the settled result immediately, then stop only when cumulative P/L reaches a configured threshold, the configured consecutive-loss limit is reached, or the requested run count is complete. A bot control must visibly switch to Stop Bot while its loop is active.