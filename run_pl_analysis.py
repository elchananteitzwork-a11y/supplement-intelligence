"""
run_pl_analysis.py — Private-label opportunity analysis.

Analyzes validated categories at a market level to identify NEW product
concepts worth creating, not existing products worth copying.

For each category: Demand, Competition, Subscription, Trend, Market Gap.
Synthesizes multi-problem product concepts and ranks top 25 by PL score.

Output: private_label_opportunities.csv
"""

import csv
import json
from pathlib import Path
from datetime import datetime, timezone

# ── Category configs ──────────────────────────────────────────────────────────
import sys, os
_env = Path(".env")
if _env.exists():
    for _line in _env.read_text().splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _, _v = _line.partition("="); os.environ.setdefault(_k.strip(), _v.strip())
sys.path.insert(0, str(Path(__file__).parent))

# ── Load data ─────────────────────────────────────────────────────────────────

def load_cache(path: Path) -> list:
    if not path.exists():
        return []
    d = json.loads(path.read_text())
    return d.get("all_normalized", d.get("normalized_products", []))


def load_scored() -> dict:
    """Load opportunity_report.csv keyed by category."""
    path = Path("opportunity_report.csv")
    if not path.exists():
        return {}
    from collections import defaultdict
    result = defaultdict(list)
    for row in csv.DictReader(open(path)):
        result[row["category"]].append(row)
    return result


CACHE_DIR  = Path("keepa_cache")
TODAY      = "2026-06-08"
OLD_DATE   = "2026-06-05"

CACHE_MAP = {
    "yoga_mats":       CACHE_DIR / f"yoga_mats_discovery_3375251_{TODAY}.json",
    "resistance_bands":CACHE_DIR / f"resistance_bands_discovery_3375251_{TODAY}.json",
    "teeth_whitening": CACHE_DIR / f"teeth_whitening_discovery_3760901_{TODAY}.json",
    "dog_treats":      CACHE_DIR / f"dog_treats_discovery_2619533_{TODAY}.json",
    "ice_cube_molds":  CACHE_DIR / f"ice_cube_molds_discovery_284507_{TODAY}.json",
    "reusable_straws": CACHE_DIR / f"reusable_straws_discovery_284507_{TODAY}.json",
    "cooking_utensils":CACHE_DIR / f"cooking_utensils_discovery_284507_{TODAY}.json",
    "potholders":      CACHE_DIR / f"potholders_discovery_284507_{TODAY}.json",
    "candles":         CACHE_DIR / f"candles_discovery_1055398_{TODAY}.json",
}

# ── Category config knowledge ─────────────────────────────────────────────────
# subscription_eligible, repeat_purchase_potential from categories/*.py

CATEGORY_META = {
    "teeth_whitening": {
        "display": "Teeth Whitening",
        "subscription_eligible": True,
        "rpp": 80,
        "price_floor": 15.0,
        "market_size": "~$1.8B US oral beauty market",
        "tiktok_fit": "VERY HIGH",
    },
    "dog_treats": {
        "display": "Dog Treats & Chews",
        "subscription_eligible": True,
        "rpp": 92,
        "price_floor": 15.0,
        "market_size": "~$9B US dog food/treat market",
        "tiktok_fit": "HIGH",
    },
    "candles": {
        "display": "Candles & Holders",
        "subscription_eligible": False,
        "rpp": 65,
        "price_floor": 15.0,
        "market_size": "~$500M US home fragrance / candle accessories",
        "tiktok_fit": "HIGH",
    },
    "cooking_utensils": {
        "display": "Cooking Utensils",
        "subscription_eligible": False,
        "rpp": 20,
        "price_floor": 15.0,
        "market_size": "~$1.2B kitchen tools segment",
        "tiktok_fit": "HIGH",
    },
    "ice_cube_molds": {
        "display": "Ice Cube Molds & Trays",
        "subscription_eligible": False,
        "rpp": 25,
        "price_floor": 10.0,
        "market_size": "~$200M cocktail/entertaining accessories",
        "tiktok_fit": "HIGH",
    },
    "reusable_straws": {
        "display": "Reusable Straws",
        "subscription_eligible": False,
        "rpp": 30,
        "price_floor": 8.0,
        "market_size": "~$130M eco drinkware segment",
        "tiktok_fit": "MODERATE",
    },
    "resistance_bands": {
        "display": "Resistance Bands",
        "subscription_eligible": False,
        "rpp": 35,
        "price_floor": 15.0,
        "market_size": "~$1.1B home fitness equipment",
        "tiktok_fit": "HIGH",
    },
    "yoga_mats": {
        "display": "Yoga Mats",
        "subscription_eligible": False,
        "rpp": 30,
        "price_floor": 20.0,
        "market_size": "~$600M yoga equipment US",
        "tiktok_fit": "HIGH",
    },
    "potholders": {
        "display": "Oven Mitts & Potholders",
        "subscription_eligible": False,
        "rpp": 20,
        "price_floor": 15.0,
        "market_size": "~$180M kitchen protection",
        "tiktok_fit": "MODERATE",
    },
}

# ── Compute category-level scores from real data ──────────────────────────────

def compute_category_scores(cat: str, prods: list, scored_rows: list) -> dict:
    """Derive demand, competition, trend, gap scores from empirical data."""

    # Raw product stats from cache
    reviews = [p.get("current", {}).get("review_count") or 0 for p in prods]
    prices  = [p.get("current", {}).get("amazon_price") or
               p.get("current", {}).get("buybox_price") or 0 for p in prods]
    n = len(prods) or 1

    prices_nonzero = [p for p in prices if p > 0]
    reviews_nonzero = [r for r in reviews if r > 0]

    under_1k  = sum(1 for r in reviews if 0 < r < 1000)
    under_5k  = sum(1 for r in reviews if 0 < r < 5000)
    mean_rev  = sum(reviews_nonzero) / len(reviews_nonzero) if reviews_nonzero else 0

    price_spread = (max(prices_nonzero) - min(prices_nonzero)) if len(prices_nonzero) >= 2 else 0
    avg_price    = sum(prices_nonzero) / len(prices_nonzero) if prices_nonzero else 0

    # Scored products
    clean = sum(1 for r in scored_rows if int(r.get("integrity_score") or 0) >= 80)
    susp  = sum(1 for r in scored_rows if int(r.get("integrity_score") or 0) < 40)
    total_scored = len(scored_rows) or 1

    trend_vals = [int(r.get("trend_score") or 0) for r in scored_rows]
    avg_trend  = sum(trend_vals) / len(trend_vals) if trend_vals else 50

    rev_vals = [int((r.get("monthly_revenue") or "0").replace(",","")) for r in scored_rows]
    avg_revenue = sum(rev_vals) / len(rev_vals) if rev_vals else 0

    # ── Demand Score (0–100) ──────────────────────────────────────────────────
    # Based on avg monthly revenue of top products + market size signal
    demand_base = min(100, avg_revenue / 1000)            # $100K/mo → 100
    demand = min(100, max(20, int(demand_base)))

    # ── Competition Score (0–100, higher = LESS competitive = BETTER) ────────
    # Based on % of top products with low review counts
    pct_under1k  = under_1k / n
    pct_under5k  = under_5k / n
    susp_pct     = susp / total_scored

    comp_base = (pct_under1k * 50) + (pct_under5k * 30) + (susp_pct * 20)
    competition = min(100, max(10, int(comp_base * 100)))

    # ── Subscription Score (0–100) ────────────────────────────────────────────
    meta = CATEGORY_META.get(cat, {})
    rpp  = meta.get("rpp", 20)
    sub_eligible = meta.get("subscription_eligible", False)
    subscription = min(100, int(rpp + (20 if sub_eligible else 0)))

    # ── Trend Score (0–100) ───────────────────────────────────────────────────
    trend = min(100, max(15, int(avg_trend)))

    # ── Market Gap Score (0–100) ──────────────────────────────────────────────
    # Suspicious review rate = bigger gap for clean brand
    # Price compression = differentiation opportunity
    # Low accessibility with high revenue = gap
    gap_from_suspicion = susp_pct * 60
    gap_from_price     = min(30, (1 - (price_spread / (avg_price + 1))) * 30) if avg_price > 0 else 20
    gap_from_reviews   = (1 - pct_under1k) * 10     # fewer accessible = more gap
    gap = min(100, max(20, int(gap_from_suspicion + gap_from_price + gap_from_reviews)))

    # ── Overall PL Score ──────────────────────────────────────────────────────
    # Demand(25) + Competition(25) + Subscription(20) + Trend(15) + Gap(15)
    overall = (demand * 0.25 + competition * 0.25 + subscription * 0.20
               + trend * 0.15 + gap * 0.15)

    return {
        "demand": demand,
        "competition": competition,
        "subscription": subscription,
        "trend": trend,
        "gap": gap,
        "overall": round(overall, 1),
        # diagnostics
        "_under1k": under_1k,
        "_n_prods": n,
        "_avg_rev": avg_revenue,
        "_susp_pct": susp_pct,
        "_avg_trend": avg_trend,
        "_price_spread": price_spread,
        "_avg_price": avg_price,
    }


# ── Customer problems per category ────────────────────────────────────────────
# Derived from: title keyword analysis + category knowledge + review sentiment signals

CUSTOMER_PROBLEMS = {
    "teeth_whitening": [
        "Sensitivity pain during/after whitening treatments",
        "Skepticism about whitening effectiveness and speed",
        "Fear of enamel damage from peroxide",
        "Staining from daily coffee, wine, tea consumption",
        "Brand distrust (high suspicious integrity rate in market)",
        "Desire for subscription-friendly reorder (monthly habit)",
    ],
    "dog_treats": [
        "Artificial preservatives and ingredients in mass-market treats",
        "Need for multi-functional treats (training + dental + digestion)",
        "Owners want treats that reinforce health outcomes, not just taste",
        "Subscription fatigue from generic treat boxes",
        "High-value training treat shortage for reactive/anxious dogs",
        "Grain-free and limited-ingredient options for allergy-prone dogs",
    ],
    "candles": [
        "Desire for aesthetic home decor that creates atmosphere",
        "Gifting occasion without knowing recipient's scent preferences",
        "Tealight holders that match modern interior design styles",
        "Low-cost entry point for entertaining and table settings",
        "Brand differentiation is almost entirely visual/aesthetic",
    ],
    "cooking_utensils": [
        "Generic 33-piece sets with tools that never get used",
        "Handle staining and dishwasher degradation over time",
        "No brand story or identity in an anonymous market",
        "TikTok food content demands aesthetically pleasing tools",
        "Silicone quality variance (staining, heat tolerance unknown)",
        "High fake review rate destroys consumer trust in category",
    ],
    "ice_cube_molds": [
        "Diluted cocktails from regular ice melting too fast",
        "Boring, identical ice shapes for entertaining",
        "No complete 'cocktail aesthetic' product system",
        "Price compression: nearly all products at same price point",
        "Fake review saturation: consumers cannot trust recommendations",
    ],
    "reusable_straws": [
        "Metal straws transfer metallic taste to beverages",
        "Hard to clean interior without proper brush",
        "No brand differentiation beyond material type",
        "Replacement straw ecosystem (for Owala, Stanley etc.) fragmented",
        "Eco-conscious buyers want lifestyle identity, not just utility",
    ],
    "resistance_bands": [
        "Bands snap or degrade quickly under repeated tension",
        "Generic loop band sets with no progression system",
        "Declining search trend (market maturing, feature parity)",
        "No premium brand at a defensible price point",
        "Women-specific glute training underserved by generic sets",
    ],
    "yoga_mats": [
        "Mat slipping during hot yoga and sweat-heavy practice",
        "Portability: heavy mats difficult to carry to studio",
        "Alignment guides for beginners not built into mats",
        "Market dominated by Retrospec/Gaiam at commodity prices",
        "Yoga ACCESSORIES (towels, straps, blocks) under-branded",
    ],
    "potholders": [
        "Cheap oven mitts fail heat resistance above 400°F",
        "Ugly, generic designs clash with aesthetic kitchens",
        "Single-use designs vs. multi-surface protection sets",
        "High fake review rate: 83% scored products suspicious",
        "Gifting market with no premium brand owning the space",
    ],
}

# ── Product concepts per category ─────────────────────────────────────────────
# Each concept is: (concept_name, rationale, tiktok_angle, multiplier)
# multiplier: 0.8–1.3 vs category base score

PRODUCT_CONCEPTS = {
    "teeth_whitening": [
        (
            "Whitening + Sensitivity Relief Strips",
            "Dual-action: 7% hydrogen peroxide on outer layer, hydroxyapatite on inner layer. Addresses the #1 consumer fear (sensitivity) while delivering results. Subscription model from day 1.",
            "Before/after smile transformation videos, 'Sensitive Teeth Approved' UGC campaigns",
            1.25,
        ),
        (
            "Coffee Lover's Daily Whitening Pen",
            "Single-SKU product solving a single known trigger. Coffee drinkers are the #1 whitening strip customer. A portable pen used after morning coffee is a daily ritual product with repeat purchase.",
            "Morning routine TikToks, 'coffee but make it clean teeth' aesthetic",
            1.15,
        ),
        (
            "90-Day Whitening Habit System",
            "3-month whitening kit with 3 progressively stronger strip intensities. Converts a one-time purchase into a subscription journey. Premium positioning vs generic 7-treatment strips.",
            "Before/after transformation arcs, 30/60/90 day progress content",
            1.20,
        ),
    ],
    "dog_treats": [
        (
            "3-in-1 Functional Dog Treat: Training + Dental + Gut Health",
            "Single treat format addressing three real problems. Soft training treat texture with dental enzyme coating and prebiotics. Premium positioning at $28–$35 price point. Subscription-first.",
            "Dog training TikToks, 'what I feed my dog for gut health' content, vet collab videos",
            1.30,
        ),
        (
            "High-Value Training Treats for Reactive Dogs",
            "Focused on dog owners with reactive/anxious dogs — an underserved, passionate segment. Freeze-dried single-ingredient (salmon or duck liver). Tiny pieces, high value for distraction training.",
            "Reactive dog training transformation videos, 'reactivity tips' content community",
            1.20,
        ),
        (
            "Monthly Functional Dog Treat Subscription Box",
            "Curated monthly treats built around a health theme (dental month, joint health month, etc.). Owned subscriber relationship vs one-time purchase. Builds brand community.",
            "Unboxing content, 'what my dog got this month' series",
            1.10,
        ),
    ],
    "candles": [
        (
            "Aesthetic Tealight Holder Brand (Monthly Edit)",
            "The candle accessories market has 12/15 products under 1K reviews — extremely accessible. Build a visual brand around seasonal 12-piece holder collections. No competition with established candle brands.",
            "Home decor transformation TikToks, 'candle aesthetic' set-up videos",
            1.30,
        ),
        (
            "Clean Scent Candle Subscription (Natural Soy + Botanicals)",
            "Actual scented candles, not holders. Subscription model in a category where holders dominate Amazon. Low competition for branded scented candles at $25–$35. DTC first, Amazon second.",
            "Slow-burn aesthetic videos, 'Sunday reset' candle ritual content",
            1.25,
        ),
        (
            "Gifting Candle Holder Collection (Holiday + Everyday)",
            "Candle holders positioned explicitly as gifts. Bundle 6 votives + display tray. Gift market amplifies AOV. The 12/15 products under 1K reviews means almost zero gifting brand exists here.",
            "Gift guide TikToks, 'gifts under $30' content, holiday aesthetic",
            1.10,
        ),
    ],
    "cooking_utensils": [
        (
            "The 5-Essential Kitchen Brand (Anti-33-Piece-Kit)",
            "The market is flooded with 33-piece sets at identical prices with suspicious reviews. A curated 5-piece 'the only tools you need' bundle at $34 with a brand story wins on trust + TikTok.",
            "Kitchen purge TikToks, 'cooking with less' minimalist chef aesthetic",
            1.25,
        ),
        (
            "TikTok Kitchen Aesthetic Set (Color-Matched, Content-Ready)",
            "Every tool designed to look good on camera: matte black, sage green, blush. Content creators buy matching sets for aesthetic consistency. Premium price $45–$65 vs commodity $14.",
            "Food content TikToks, recipe videos where tools are props, creator collab",
            1.20,
        ),
        (
            "The Sourdough Baking Kit",
            "Micro-niche: specialized tools for the sourdough trend (bench scraper, lame, Dutch oven handles, proofing bowl). No general kitchen brand owns this. High intent, specific customer.",
            "Sourdough bread TikToks, 'baking tools you need' education content",
            1.15,
        ),
    ],
    "ice_cube_molds": [
        (
            "Cocktail Aesthetic System (Sphere Ice + Flavor Infuser + Garnish Tray)",
            "Three products solving the same cocktail presentation problem. Sphere ice is TikTok-native. Add an infuser and garnish tray and you own the 'at-home bartending aesthetic' niche.",
            "Cocktail making TikToks, 'satisfying ice sphere' content, cocktail hour aesthetic",
            1.30,
        ),
        (
            "Whiskey + Spirits Connoisseur Ice Bundle",
            "Sphere ice + whiskey stone alternative + branded pouch. Gift-first SKU. Spirits enthusiasts are high LTV and spend $45–$75 on accessories. Almost no brand owns this on Amazon.",
            "Whiskey content creators, 'upgrade your home bar' gift guides",
            1.20,
        ),
        (
            "Food-Grade Silicone Reorder Pack (Subscription Ice Trays)",
            "Silicone degrades and stains. Build a subscription model around replacement trays. $17/month keeps the customer on fresh trays. 3-month starter kit as first purchase.",
            "Clean kitchen TikToks, 'replace your stained ice trays' viral hook",
            1.05,
        ),
    ],
    "reusable_straws": [
        (
            "Compatible Replacement Straw Ecosystem (Owala + Stanley)",
            "The #9 ranked product in our report (XZESH, CLEAN integrity) is already doing $5,475/mo with fewer reviews. A branded 'compatible replacement' line for the 3 biggest water bottle brands.",
            "Stanley cup TikToks, 'Owala accessories you need' micro-niche content",
            1.25,
        ),
        (
            "Botanical Glass Straw + Herb Infuser Bundle",
            "Glass straws paired with a fruit/herb infuser insert. Aesthetic, TikTok-native, solves 'boring water' problem. Glass eliminates metal taste. Premium price $24–$32 vs $11 commodity.",
            "Hydration routine TikToks, 'aesthetic water' content, wellness aesthetic",
            1.20,
        ),
        (
            "Eco Kitchen Starter Bundle (Straws + Silicone Lids + Produce Bags)",
            "Expands the reusable straw purchase into a zero-waste kitchen starter kit. AOV moves from $11 to $35. One brand owning the eco kitchen transition narrative.",
            "Zero-waste lifestyle TikToks, 'swap for sustainable' content series",
            1.10,
        ),
    ],
    "resistance_bands": [
        (
            "Women's Progressive Fabric Glute Training System",
            "Fabric bands that won't snap, color-coded by resistance, with a 12-week home glute program QR code inside. Premium $29 price vs commodity $17. Clear demographic: women 25–40.",
            "Home workout TikToks, glute transformation content, 'what I use at home' vlogs",
            1.25,
        ),
        (
            "Resistance Band + Mobility Recovery Kit",
            "Resistance training + post-workout recovery in one bundle. Add a foam roller and guided stretching guide. Solves the 'I work out but I don't recover' problem. Higher AOV.",
            "Recovery TikToks, 'post-workout routine' content, fitness creator collab",
            1.15,
        ),
        (
            "Travel Resistance Workout System (Hotel Gym Alternative)",
            "Compact resistance bands + door anchor + carry case. Target: frequent business travelers who want to maintain training. Specific, underserved, premium pricing justified.",
            "Travel fitness TikToks, 'hotel room workout' content, 'gym in your bag'",
            1.10,
        ),
    ],
    "yoga_mats": [
        (
            "Hot Yoga Towel Set + Grip Spray (Anti-Slip System)",
            "The MIAOMIAO yoga towel ranked #11 with CLEAN integrity and only 4 reviews earning $11K/mo. An anti-slip towel + grip-enhancing spray as a bundle directly solves hot yoga's #1 complaint.",
            "Hot yoga TikToks, 'no more mat slipping' content, studio class prep videos",
            1.30,
        ),
        (
            "Beginner Yoga Starter System (Mat + Blocks + Strap)",
            "New yoga practitioners need everything at once. Curated beginner bundle vs buying pieces separately. Soft, alignment-guide-printed mat + accessories. Reduces beginner anxiety.",
            "Beginner yoga journey content, '30-day yoga challenge' TikTok series",
            1.15,
        ),
        (
            "Travel + Studio Foldable Yoga Mat",
            "Portable, foldable design for yogis who practice between home and studio. Target: working professionals who travel. Premium $45–$55 positioning vs commodity $20–$25 mats.",
            "Travel lifestyle TikToks, 'yoga anywhere' content, wellness travel aesthetic",
            1.05,
        ),
    ],
    "potholders": [
        (
            "Aesthetic Linen + Silicone Kitchen Protection Brand",
            "The potholders market is 83% suspicious — almost no clean brand. A premium linen-exterior, silicone-interior set at $28–$35 with a brand story wins on trust and kitchen aesthetics.",
            "Kitchen aesthetic TikToks, 'upgrade your kitchen' home decor content",
            1.25,
        ),
        (
            "Matching Kitchen Textile Bundle (Mitts + Towels + Apron)",
            "Expand single-SKU into a branded kitchen textile line. Increases AOV from $15 → $55. Creates a brand identity around kitchen aesthetics. Gifting angle strong.",
            "Kitchen organization TikToks, gift guide content, 'host a dinner party' aesthetic",
            1.20,
        ),
        (
            "Professional-Grade High-Heat Oven Mitts (Silicone Pro)",
            "Professional heat rating (932°F) vs cheap consumer versions. Target bakers, grill users, cast iron cooks. Specific, defensible, $35–$45 vs $12 commodity.",
            "Cast iron cooking TikToks, 'cooking tools pros use' content, BBQ content",
            1.10,
        ),
    ],
}

# ── Scoring ───────────────────────────────────────────────────────────────────

def score_concepts(cat, scores, concepts):
    results = []
    for concept_name, rationale, tiktok, multiplier in concepts:
        pl_score = min(100, round(scores["overall"] * multiplier, 1))
        results.append({
            "category":              CATEGORY_META.get(cat, {}).get("display", cat),
            "product_concept":       concept_name,
            "demand_score":          scores["demand"],
            "competition_score":     scores["competition"],
            "subscription_score":    scores["subscription"],
            "trend_score":           scores["trend"],
            "market_gap_score":      scores["gap"],
            "pl_opportunity_score":  pl_score,
            "tiktok_shop_fit":       CATEGORY_META.get(cat, {}).get("tiktok_fit", "MODERATE"),
            "market_size":           CATEGORY_META.get(cat, {}).get("market_size", ""),
            "potential_customer_problems": " | ".join(CUSTOMER_PROBLEMS.get(cat, [])[:3]),
            "all_problems":          "\n".join(f"• {p}" for p in CUSTOMER_PROBLEMS.get(cat, [])),
            "concept_rationale":     rationale,
            "tiktok_angle":          tiktok,
        })
    return results


# ── Main ──────────────────────────────────────────────────────────────────────

def run():
    scored_by_cat = load_scored()

    print(f"\n{'#'*70}")
    print(f"  PRIVATE LABEL OPPORTUNITY ANALYSIS")
    print(f"  Validated categories: {len(CATEGORY_META)}")
    print(f"  {datetime.now(tz=timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"{'#'*70}")

    all_concepts = []

    for cat, meta in CATEGORY_META.items():
        prods   = load_cache(CACHE_MAP.get(cat, Path("__missing__")))
        scored  = scored_by_cat.get(cat, [])
        scores  = compute_category_scores(cat, prods, scored)

        print(f"\n{'─'*65}")
        print(f"  {meta['display'].upper()}")
        print(f"{'─'*65}")
        print(f"  Demand:       {scores['demand']:>3}/100")
        print(f"  Competition:  {scores['competition']:>3}/100  (higher = less competitive)")
        print(f"  Subscription: {scores['subscription']:>3}/100")
        print(f"  Trend:        {scores['trend']:>3}/100")
        print(f"  Market Gap:   {scores['gap']:>3}/100")
        print(f"  PL Score:     {scores['overall']:>5}/100")
        print(f"  Products < 1K reviews: {scores['_under1k']}/{scores['_n_prods']}")
        print(f"  Suspicious rate: {scores['_susp_pct']:.0%}")
        print(f"\n  Customer problems:")
        for p in CUSTOMER_PROBLEMS.get(cat, []):
            print(f"    · {p}")

        concepts = score_concepts(cat, scores, PRODUCT_CONCEPTS.get(cat, []))
        for c in concepts:
            print(f"\n  ▸ {c['product_concept']}")
            print(f"    PL Score: {c['pl_opportunity_score']}")
        all_concepts.extend(concepts)

    # ── Global ranking ────────────────────────────────────────────────────────
    all_concepts.sort(key=lambda x: x["pl_opportunity_score"], reverse=True)
    top25 = all_concepts[:25]

    print(f"\n\n{'═'*70}")
    print(f"  TOP 25 PRIVATE LABEL OPPORTUNITIES — RANKED")
    print(f"{'═'*70}")

    for rank, c in enumerate(top25, 1):
        print(f"\n  #{rank:02d}  [{c['category'].upper()}]  Score: {c['pl_opportunity_score']}/100")
        print(f"       {c['product_concept']}")
        print(f"       Demand {c['demand_score']} | Comp {c['competition_score']} | Sub {c['subscription_score']} | Trend {c['trend_score']} | Gap {c['market_gap_score']}")
        print(f"       TikTok: {c['tiktok_shop_fit']}  |  {c['market_size']}")
        print(f"       TikTok angle: {c['tiktok_angle'][:70]}")

    # ── Write CSV ─────────────────────────────────────────────────────────────
    out = Path("private_label_opportunities.csv")
    fieldnames = [
        "rank", "category", "product_concept", "pl_opportunity_score",
        "demand_score", "competition_score", "subscription_score",
        "trend_score", "market_gap_score", "tiktok_shop_fit", "market_size",
        "potential_customer_problems", "concept_rationale", "tiktok_angle",
    ]
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        for rank, c in enumerate(top25, 1):
            row = {"rank": rank}
            row.update(c)
            w.writerow(row)

    print(f"\n\n  Saved: {out}  ({len(top25)} opportunities)")
    print(f"{'#'*70}\n")


if __name__ == "__main__":
    run()
