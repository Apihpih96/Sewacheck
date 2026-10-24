# SewaCheck — 2-minute demo script (Android phone)

**Goal:** a ~2:00 screen recording, made entirely on an Android phone.

## Before you record (5 minutes, once)

1. **Screen recorder:** swipe down twice → *Screen record* (Samsung: "Screen recorder"; Pixel: "Screen record"). Choose **Media sounds and microphone** if you want to narrate, or record silently and add captions later.
2. **Do Not Disturb on** so no notifications appear on screen.
3. Open the demo link in **Chrome**: `https://<your-github-username>.github.io/<repo-name>/` — let it load once so the libraries are cached.
4. *(Optional, for the on-chain part)* In the **MetaMask app**: create/choose a **test-only** wallet, switch the network to **Sepolia**, and get free Sepolia test ETH from a faucet. In MetaMask tap the **Browser** tab and open the same demo link. If you skip this, use the "no wallet" path below — it still shows the fingerprint and verification.
5. Font size normal, brightness up, phone in portrait.

## The script (≈ 2:00)

| Time | Do on screen | Say (or caption) |
|---|---|---|
| 0:00–0:12 | Show the top of the page (SewaCheck title + yellow notice). | "In Malaysia there's still no Residential Tenancy Act in force — your tenancy agreement is everything. SewaCheck checks it and proves which version you signed." |
| 0:12–0:30 | Tap **Sample 1 · Unfair condo TA**. Results appear: score **0, grade D**. | "Here's a real-looking condo agreement from Cheras. Score zero — ten high-risk clauses." |
| 0:30–0:50 | Scroll to the first flags. Tap **Why it matters** on *Self-help eviction (clause 12)*. | "Clause 12 lets the landlord change the locks and cut the electricity. Under section 7(2) of the Specific Relief Act, a landlord can only recover the home through court. Every flag cites its source." |
| 0:50–1:02 | Tap **Fairer wording** → **Copy wording**. | "And it gives fairer wording I can send straight to the landlord or agent." |
| 1:02–1:12 | Tap the **High** filter, scroll briefly (seize goods, entire deposit forfeited, waiver of right to sue). | "Seizing goods without a court warrant, forfeiting the whole deposit, waiving my right to sue — all flagged, with short Bahasa Malaysia labels." |
| 1:12–1:22 | Scroll up, tap **Sample 2 · Balanced apartment TA**. Score **100, grade A**; open **Good signs**. | "A balanced agreement scores 100, with the good clauses highlighted." |
| 1:22–1:40 | Tap **2 · Fingerprint**. Show the `0x…` fingerprint. In the text box change `RM2,000` to `RM2,500` → fingerprint changes; change it back → original returns. | "Once we agree, SewaCheck makes a SHA-256 fingerprint on the phone. Change one number and the fingerprint is completely different." |
| 1:40–1:55 | **With MetaMask:** type a label like `TA A-5-2 v1`, tap **Anchor on Sepolia**, approve, wait for **Anchored ✓**. Then **3 · Verify** → **Verify by tx hash** → **✅ MATCH**. <br>**Without MetaMask:** show the yellow "Registry contract not yet deployed" box and the **Open in MetaMask app** button, then scroll to **3 · Verify**. | "Anchoring puts only the fingerprint on Ethereum — not the agreement. Anyone can later check a copy: same text, match; edited text, different." |
| 1:55–2:00 | Scroll to **Legal sources**, then back to top. | "Free, open source, no data leaves your phone. SewaCheck — check it, then prove it." |

## Tips

- If a step takes longer (e.g. waiting for Sepolia), trim the waiting in Google Photos → *Edit* → *Trim* or keep it and speed it up in a free editor (e.g. CapCut).
- Keep the video under 2:30; judges skim.
- Upload to YouTube as **Unlisted** and paste the link in the DoraHacks BUIDL page and in the README.
