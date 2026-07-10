# Mullion — Future Improvements — v2

## Scope of this document

This is deliberately **not** a backlog of features we didn't get to. Every
item here is something that is either irrational, uneconomical, or
impossible to build *correctly* before this system has real usage —
because it depends on userbase size, revenue/cost crossovers, or usage data
that doesn't exist yet. Ordinary deferred coding work (more languages,
more agent capabilities, dashboard polish, etc.) belongs in the main spec's
milestone list, not here — putting it here would just be a way of hiding
scope-cutting behind a "v2" label.

Each item states *why it can't be justified now*, not just what it is.

---

## A. Gated by userbase / needing real customers to design correctly

### A1. Multi-tenant billing & usage-based pricing
Building a pricing/billing system before there are enough real users
generating real usage patterns means designing it on guesses. Usage-based
billing tiers should be shaped by actual observed cost-per-build and
actual willingness-to-pay data, neither of which exists at v1.

### A2. Enterprise SSO / custom RBAC (beyond v1's basic org roles)
Partially superseded by **ADR-36**: v1 now ships multi-tenant
organizations (Better Auth organization plugin — orgs, memberships,
invitations, owner/admin/member roles). What stays deferred here is the
enterprise-grade layer on top: SSO/SAML, custom role definitions, and
fine-grained per-resource permissions — meaningful engineering investment
that only pays off once there are enterprise customers who need it to buy
at all.

### A3. Multi-user concurrent editing of one planning session
Real-time collaborative editing (conflict resolution, presence, shared
cursors on the architecture diagram) is only worth the engineering cost
once there are actual teams trying to plan together — which itself
requires a userbase of teams, not just individuals.

### A4. Marketplace / community-shared task graphs or templates
A template marketplace needs both a critical mass of contributors and
consumers to be useful at all — with a small userbase it's an empty shelf,
not a feature.

### A5. Multi-region deployment / data residency options
Only relevant once there are customers in specific regulated regions
(EU, etc.) asking for it. Building regional infrastructure ahead of that
demand is pure cost with no offsetting need.

### A6. SOC 2 / ISO 27001 and similar compliance certifications
Audits cost real money annually and are pursued because enterprise buyers
require them to sign a contract — they're a sales-enablement cost, not a
technical one, and make no sense to pursue before there's enterprise demand
asking for them.

### A7. Priority queueing / demand-based autoscaling of sandbox pools
Fair-queueing and burst autoscaling only matter once there's enough
concurrent usage that contention actually happens. At low volume, a simple
FIFO queue against a fixed pool is correct, not a shortcut.

---

## B. Gated by cost crossover (only worth it above a volume threshold)

### B1. Self-hosted Firecracker sandbox fleet
v1 uses a managed sandbox provider (E2B) deliberately. Self-hosting only
becomes economical above real usage volume — roughly the point where
sandbox-hours/month push past what a managed plan costs relative to running
your own bare-metal Firecracker nodes plus the ops headcount to run them.
Below that line, self-hosting is pure operational burden with no cost
benefit. This is a number to track against actual bills, not a guess to
make speculatively.

### B2. Self-hosted Temporal cluster
Same shape as B1: Temporal Cloud removes real operational cost (backing
store, worker fleet, versioning discipline) at the price of a subscription
fee. Self-hosting is worth revisiting exactly when that subscription fee
exceeds what the equivalent ops investment would cost — not before.

### B3. Dedicated / warm sandbox pools for lower latency
Pre-warmed, reserved-capacity sandbox pools reduce cold-start latency but
cost money to keep idle. Only justified once there's steady, predictable
concurrent load where the latency win is worth paying for warm capacity
that would otherwise sit unused.

### B4. Fine-tuned / custom smaller models for routine agent work
Replacing the general Coder/Tester model tier with a fine-tuned smaller
model can cut inference cost significantly — but it needs a real corpus of
past runs to fine-tune on, which only exists after real usage volume. This
is gated by both cost (only worth the engineering investment at scale) and
data (the training set doesn't exist yet).

### B5. Live hosting / one-click deployment of delivered apps
v1 delivery is archive + GitHub push, deliberately. Offering to host and
run the finished app ourselves means carrying ongoing infrastructure cost
per active deployed app, indefinitely, for every user — a cost structure
that scales with userbase in a way that only makes sense once there's a
pricing model (see A1) to offset it.

### B6. Volume/enterprise contract pricing
Custom pricing negotiated per large customer is something to build once
there are large customers to negotiate with — not a general-purpose system
to design in the abstract beforehand.

### B7. Move off Neon to self-hosted or reserved-instance Postgres
Neon's serverless, autoscale-to-zero pricing model is optimal for the
variable, low-baseline load v1 actually has. At sustained, high, constant
load, a reserved or self-hosted Postgres instance can end up cheaper per
compute-hour than serverless pricing. This is a comparison to make against
real Neon bills once real usage exists, not a migration to plan for now.

### B8. Direct-to-provider fallback bypassing OpenRouter entirely
OpenRouter's provider-level failover covers a provider outage; it does not
cover an OpenRouter platform-level outage (rare, but it has happened).
Building and maintaining a second, direct-API integration path per model
provider purely as an OpenRouter-outage bypass is real, ongoing engineering
overhead — worth it once enough users depend on the product that an
OpenRouter-level outage is a meaningful business cost, not before. Below
that line, the residual risk is acceptable and shows up like any other
stuck-task escalation, not a silent failure.

---

## How to read this list later

When revisiting this document, the right trigger for pulling an item into
active development is a concrete, observed number — a real bill, a real
support request from a real customer, a real contention event — not a
sense that "we're getting bigger now." Each item above names the number to
watch; that number crossing its threshold is what should promote it out of
this document.
