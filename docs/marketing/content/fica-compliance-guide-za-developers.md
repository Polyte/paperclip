# FICA Compliance for South African Developers: What You Actually Need to Know

**A practical guide for fintech, crypto, and platform builders.**

---

If you're building anything that handles money, identity, or onboarding in South Africa, FICA is not optional. But the gap between "you need to comply" and "here's exactly what to build" is where most developer-facing content falls short. This guide bridges that gap.

## What FICA Actually Requires

The Financial Intelligence Centre Act (FICA, Act 38 of 2001) mandates that **accountable institutions** verify customer identities and report suspicious transactions. If your platform:

- Onboards users who transact financially
- Holds customer funds (wallets, escrow, investment accounts)
- Facilitates crypto-to-fiat conversion
- Issues loans or credit
- Operates as a payment intermediary

...you are likely an accountable institution, or your clients are. Either way, identity verification (KYC) is a hard requirement.

### The three things you must do

| Requirement | What it means in practice |
|---|---|
| **Customer identification** | Collect and verify full name, ID number, residential address, and date of birth |
| **Verification of identity** | Validate the ID against a trusted source — typically the Department of Home Affairs (DHA) National Population Register |
| **Record keeping** | Store verification records for at least 5 years after the relationship ends |

## The Developer's KYC Stack

Building compliant KYC in-house is expensive and slow. Here's what a modern stack looks like:

```
User onboarding flow:
  ID document capture → Biometric verification → DHA/NPR check → Risk scoring → Onboard/Reject
```

### Option 1: Build It Yourself

You'll need:
- ID document OCR (Tesseract, Google Vision, or AWS Textract)
- Liveness detection (prevent photo/spoof attacks)
- DHA/NPR integration (direct access agreements — typically 6-12 months to negotiate)
- Biometric matching engine
- Secure audit trail and record storage

**Reality check**: The DHA integration alone requires legal agreements, compliance audits, and technical certification. Most startups spend 12-18 months and R500k-R1.5m before going live.

### Option 2: Use an Identity Verification Provider

Providers with direct DHA/NPR access handle the heavy lifting. You integrate via API and get verification results in seconds.

**What to look for:**
- Direct NPR access (not cached databases — they go stale)
- POPIA-compliant data handling (data residency in South Africa)
- Sub-5-second verification speed (users abandon slow flows)
- Transparent per-verification pricing
- Developer-friendly API with sandbox environment

**seeID** provides DHA-powered identity verification with fingerprint biometrics, direct National Population Register access, and a developer sandbox. [Start a free trial](https://seeid.co.za) to test the API.

## Common Pitfalls

### 1. Thinking a copy of the ID is enough

FICA requires **verification**, not just collection. A photo of a green ID book proves nothing — it could be stolen, photoshopped, or expired. You must validate the ID number against the DHA register and match the biometric to the person presenting it.

### 2. Ignoring POPIA while chasing FICA

FICA says verify. POPIA says protect the data. You need both. Key POPIA requirements:
- **Purpose limitation**: Only collect what FICA requires — don't hoard data
- **Storage limitation**: Delete raw biometric data after verification; store only the verification record
- **Security safeguards**: Encrypt at rest and in transit; access controls; breach notification

### 3. Manual verification doesn't scale past 100 users

A human reviewing ID documents works at 10-20 verifications per hour and costs R200-R400/hour in skilled labour. At 1,000 verifications per month, that's R10,000-R20,000/month and a 2-3 day turnaround. Automated verification costs R1-R5 per check and returns results in under 3 seconds.

### 4. Not planning for re-verification

FICA requires ongoing due diligence. If a customer's circumstances change (new ID, change of address, suspicious activity triggers), you need to re-verify. Build this into your system from day one — retrofitting is painful.

## The FICA Checklist for Developers

Before you launch, confirm:

- [ ] ID number format validation (13-digit Luhn checksum)
- [ ] ID document capture (photo or scan) with quality checks
- [ ] Biometric capture (fingerprint or face) with liveness detection
- [ ] DHA/NPR verification — not a cached database
- [ ] Biometric match: captured biometric ↔ DHA record
- [ ] Risk flagging: PEP (politically exposed person), sanctions lists, adverse media
- [ ] Audit trail: who verified, when, result, and reference number
- [ ] Secure record storage: encrypted, access-controlled, POPIA-compliant
- [ ] Re-verification triggers for high-risk events
- [ ] FIC reporting integration (suspicious transaction reports, cash threshold reports)

## How seeID Handles This

| FICA requirement | seeID implementation |
|---|---|
| ID capture & OCR | Auto-extracts from SA ID book/card images |
| Biometric capture | Fingerprint-first with multi-modal face fallback |
| DHA verification | Direct National Population Register access — 2-3 second response |
| Biometric matching | Fingerprint match against DHA record |
| POPIA compliance | Data residency in South Africa; biometric data purged post-verification |
| Audit trail | Full verification record with timestamp, result, and reference |
| Developer experience | REST API, SDKs for Node.js/Python, sandbox environment, webhook callbacks |

## Start Building

1. **Try the sandbox**: [seeID Developer Portal](https://seeid.co.za/developers) — free test credentials, no commitment
2. **Read the API docs**: Full reference with code examples in Node.js and Python
3. **Join the community**: South African fintech developers on [discord.gg/seeid](https://discord.gg/seeid)

---

*This guide was produced by seeID. We build DHA-powered identity verification for South African developers. Questions? Reach us at developers@seeid.co.za.*
