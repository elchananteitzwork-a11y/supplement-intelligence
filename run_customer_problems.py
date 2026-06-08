"""
run_customer_problems.py — Customer-problem-first private label analysis.

Starts from human pain points, not Amazon products.
Maps co-occurring problems to unmet needs.
Generates product concepts that solve 2–4 problems simultaneously.

Output: customer_problem_opportunities.csv
"""

import csv
from pathlib import Path
from datetime import datetime, timezone

# ─────────────────────────────────────────────────────────────────────────────
# CUSTOMER ARCHETYPES
# Each archetype is grounded in the market signals discovered:
#   - teeth_whitening: 83% suspicious, sub-eligible, 5/15 under 1K reviews
#   - dog_treats: RPP=92, mega-brand gap in functional/specialty segment
#   - yoga_mats: hot yoga towel at $11K/mo with 4 reviews
#   - resistance_bands: declining trend = maturing market = niche opportunity
#   - cooking_utensils: 73% suspicious, TikTok food aesthetic gap
#   - candles: 12/15 products under 1K reviews (most accessible market found)
#   - ice_cube_molds: rising trend 75, cocktail culture TikTok-native
#   - reusable_straws: Owala/Stanley replacement ecosystem fragmented
#   - potholders: 83% suspicious, kitchen aesthetic brand vacuum
# ─────────────────────────────────────────────────────────────────────────────

CUSTOMER_PROFILES = [

    # ── 1. The Self-Image Professional ───────────────────────────────────────
    # Source categories: teeth_whitening (3 top-ranked PL concepts)
    {
        "archetype": "The Self-Image Professional",
        "description": (
            "28–40 years old. Drinks 2–4 cups of coffee daily. Has professional "
            "video calls, a curated LinkedIn/Instagram presence, and notices teeth "
            "staining in photos. Wants to look confident without being vain about it. "
            "Values transparent ingredient brands. Lives in a city, earns $70K–$120K."
        ),
        "source_categories": ["teeth_whitening"],
        "market_data": {
            "demand": 27,
            "competition": 100,
            "subscription": 100,
            "trend": 37,
            "gap": 85,
            "suspicious_rate": 0.83,
            "market_size": "~$1.8B US oral beauty",
        },
        "all_pain_points": [
            "Coffee stains teeth progressively despite twice-daily brushing",
            "Whitening strips cause sharp tooth sensitivity for 24–48 hours",
            "Results fade within 2–3 weeks of stopping treatment",
            "Feels self-conscious smiling in video calls, photos, first dates",
            "Cannot trust whitening brand claims (fake reviews everywhere)",
            "Peroxide fear: worried about long-term enamel erosion",
            "Treatment timing is inconvenient (30 min with strips in = can't drink coffee)",
            "Strips fall off teeth, especially on lower row",
            "Dental office whitening costs $500–$800, not accessible",
            "Daily brushing alone is insufficient between coffee cups",
        ],
        "pain_clusters": [
            {
                "cluster_name": "The Daily Coffee–Stain Loop",
                "pain_points": [
                    "Coffee stains teeth progressively despite twice-daily brushing",
                    "Results fade within 2–3 weeks of stopping treatment",
                    "Daily brushing alone is insufficient between coffee cups",
                ],
                "co_occurrence_reason": (
                    "These three problems occur because coffee is consumed daily but "
                    "treatment is periodic. No product currently addresses daily "
                    "stain maintenance AS PART OF the coffee ritual."
                ),
                "unmet_need": (
                    "A micro-dose daily whitening habit that fits inside the coffee "
                    "routine — not replacing it, not fighting it."
                ),
                "concept": {
                    "name": "Morning Ritual Whitening System",
                    "description": (
                        "A 3-step system built around the coffee drinker's morning: "
                        "(1) a pre-coffee enamel shield tablet that reduces binding of "
                        "tannins for 4 hours; (2) a 5-minute low-peroxide whitening pen "
                        "used after the last cup of the day; (3) a monthly intensive "
                        "strip treatment. The ritual is the product. Subscription "
                        "delivers each component at consumption frequency."
                    ),
                    "usp": (
                        "The only whitening system designed for coffee drinkers, not "
                        "despite them. Whiten your teeth in the same time it takes to "
                        "make your morning cup."
                    ),
                    "problems_solved": 3,
                    "intensity": 88,
                    "frequency": 95,
                    "solution_gap": 90,
                    "addressable_market": 75,
                    "brandability": 90,
                },
            },
            {
                "cluster_name": "The Sensitivity–Confidence Trap",
                "pain_points": [
                    "Whitening strips cause sharp tooth sensitivity for 24–48 hours",
                    "Feels self-conscious smiling in video calls, photos, first dates",
                    "Peroxide fear: worried about long-term enamel erosion",
                ],
                "co_occurrence_reason": (
                    "The very product meant to fix the confidence problem creates "
                    "a physical pain problem. Most customers stop whitening treatments "
                    "not because they're satisfied but because they can't tolerate "
                    "the sensitivity."
                ),
                "unmet_need": (
                    "A whitening product that actively strengthens enamel while "
                    "whitening — addressing the fear of damage directly in the "
                    "product mechanism."
                ),
                "concept": {
                    "name": "Whitening + Remineralizing Dual-Layer Strip",
                    "description": (
                        "A strip with two functional layers: an outer whitening layer "
                        "(7% hydrogen peroxide) and an inner remineralizing layer "
                        "(hydroxyapatite + calcium) that activates on contact with teeth. "
                        "The enamel protection is built into the treatment — no "
                        "separate sensitivity toothpaste needed. Packaged with "
                        "transparent ingredient disclosure and clinical test results."
                    ),
                    "usp": (
                        "The first whitening strip that makes your enamel stronger while "
                        "it whitens. No sensitivity. No compromise."
                    ),
                    "problems_solved": 3,
                    "intensity": 92,
                    "frequency": 60,
                    "solution_gap": 88,
                    "addressable_market": 80,
                    "brandability": 92,
                },
            },
            {
                "cluster_name": "The Trust Vacuum",
                "pain_points": [
                    "Cannot trust whitening brand claims (fake reviews everywhere)",
                    "Strips fall off teeth, especially on lower row",
                    "Treatment timing is inconvenient (30 min with strips in = can't drink coffee)",
                ],
                "co_occurrence_reason": (
                    "83% of ranked whitening products have suspicious review integrity. "
                    "Consumers have been burned by products that didn't work as claimed. "
                    "Combined with physical inconveniences, this creates mass churn "
                    "and a brand loyalty vacuum."
                ),
                "unmet_need": (
                    "A whitening brand that leads with radical transparency: published "
                    "clinical results, ingredient disclosure, and a product design "
                    "that respects the user's time (5-minute format, stays on)."
                ),
                "concept": {
                    "name": "Transparent Whitening Co. (5-Minute Strips)",
                    "description": (
                        "New-generation flexible strips that adhere to the tooth contour "
                        "and dissolve in 5 minutes with no removal needed. Brand built "
                        "on: (1) QR-code ingredient transparency; (2) a 30-day "
                        "results guarantee with photos from real customers; "
                        "(3) peroxide-free formula for daily use. Brand identity: "
                        "the opposite of generic Amazon."
                    ),
                    "usp": (
                        "5 minutes. No removal. Every ingredient explained. "
                        "Or your money back."
                    ),
                    "problems_solved": 3,
                    "intensity": 80,
                    "frequency": 60,
                    "solution_gap": 85,
                    "addressable_market": 82,
                    "brandability": 88,
                },
            },
        ],
    },

    # ── 2. The Intentional Dog Parent ─────────────────────────────────────────
    # Source categories: dog_treats (RPP=92, $9B market, functional gap)
    {
        "archetype": "The Intentional Dog Parent",
        "description": (
            "28–42 years old. Treats their dog as a family member. Anxious about "
            "ingredient lists. Follows dog training content on TikTok. Wants measurable "
            "outcomes: a calmer dog, cleaner teeth, healthier gut. Spends $80–$120/month "
            "on dog-related purchases. Willing to pay more for clean ingredients."
        ),
        "source_categories": ["dog_treats"],
        "market_data": {
            "demand": 20,
            "competition": 100,
            "subscription": 100,
            "trend": 50,
            "gap": 20,
            "suspicious_rate": 0.0,
            "market_size": "~$9B US dog food/treat market",
        },
        "all_pain_points": [
            "Treats contain artificial preservatives, dyes, and unidentified 'meat by-products'",
            "Training treats are too large — 300 repetitions in a session depletes a bag",
            "Dog's breath is noticeably bad after most treat brands",
            "Dog has loose stools or digestive upset tied to treat ingredients",
            "No single treat addresses both training reward AND health benefit",
            "Difficult to find grain-free options with single-protein ingredient lists",
            "Premium treat brands exist but $40+ bags feel like a gamble without proof",
            "Running out of treats mid-session derails training progress",
            "Different 'value' treats needed (high-value for distractions, low-value for repetitions)",
            "Subscription boxes are not customized to the dog's size, needs, or training stage",
        ],
        "pain_clusters": [
            {
                "cluster_name": "Training Effectiveness Stack",
                "pain_points": [
                    "Training treats are too large — 300 repetitions in a session depletes a bag",
                    "Different 'value' treats needed (high-value for distractions, low-value for repetitions)",
                    "Running out of treats mid-session derails training progress",
                ],
                "co_occurrence_reason": (
                    "Effective dog training requires both high-frequency low-value treats "
                    "(for repetitions) and high-value treats (for breaking attention from "
                    "distractions). No product exists as a dual-tier training system "
                    "in a single purchase."
                ),
                "unmet_need": (
                    "A training treat duo: tiny, low-calorie 'rep treats' for "
                    "repetitions + a high-value 'jackpot treat' for breakthrough moments. "
                    "Delivered in a ratio based on dog size and training frequency."
                ),
                "concept": {
                    "name": "The Training Treat Duo (Low-Value + High-Value System)",
                    "description": (
                        "Two-SKU training system sold together: (1) micro-treats, "
                        "1.5 calories each, freeze-dried single ingredient (chicken or "
                        "salmon), 500+ per bag for high-frequency training; (2) "
                        "jackpot treats, high-aroma freeze-dried liver pieces, used "
                        "only for breakthrough moments. Subscription calibrated to "
                        "dog weight. Includes QR-code access to training frequency "
                        "calculator so customers know exactly when to reorder."
                    ),
                    "usp": (
                        "The two-tier treat system built for the science of reinforcement. "
                        "The right treat, at the right moment, every time."
                    ),
                    "problems_solved": 3,
                    "intensity": 82,
                    "frequency": 90,
                    "solution_gap": 88,
                    "addressable_market": 70,
                    "brandability": 85,
                },
            },
            {
                "cluster_name": "Health Outcome Loop",
                "pain_points": [
                    "Treats contain artificial preservatives, dyes, and unidentified 'meat by-products'",
                    "Dog's breath is noticeably bad after most treat brands",
                    "Dog has loose stools or digestive upset tied to treat ingredients",
                ],
                "co_occurrence_reason": (
                    "All three problems are caused by the same root: artificial ingredients "
                    "in mass-market treats. Solving the ingredient problem (clean, functional) "
                    "solves all three simultaneously. No brand currently positions treats "
                    "as functional health delivery vehicles."
                ),
                "unmet_need": (
                    "A treat brand that is a health supplement delivery system first, "
                    "a reward second. Each treat has a documented health function: "
                    "dental enzyme, prebiotic fiber, or omega-3."
                ),
                "concept": {
                    "name": "3-in-1 Functional Chew: Dental + Digestive + Coat Health",
                    "description": (
                        "A single soft chew format (daily) that layers three ingredients: "
                        "(1) dental enzymes to break down plaque biofilm; (2) prebiotic "
                        "chicory root for gut microbiome support; (3) omega-3 fish oil "
                        "for coat quality. Peanut butter + pumpkin flavor. Subscription "
                        "model. Includes monthly 'health check' prompt in app so owners "
                        "track improvements. Brand positioning: 'your vet in a bag.'"
                    ),
                    "usp": (
                        "One chew a day. Cleaner teeth, healthier gut, shinier coat. "
                        "No artificial anything. Vet-reviewed."
                    ),
                    "problems_solved": 3,
                    "intensity": 85,
                    "frequency": 95,
                    "solution_gap": 90,
                    "addressable_market": 72,
                    "brandability": 92,
                },
            },
            {
                "cluster_name": "The Anxious Owner Trust Gap",
                "pain_points": [
                    "Premium treat brands exist but $40+ bags feel like a gamble without proof",
                    "No single treat addresses both training reward AND health benefit",
                    "Subscription boxes are not customized to the dog's size, needs, or training stage",
                ],
                "co_occurrence_reason": (
                    "Dog parents willing to spend premium have no brand that earns their "
                    "trust with transparency AND customization. Every subscription box "
                    "sends the same treats regardless of dog. This creates churn."
                ),
                "unmet_need": (
                    "A subscription that adapts: dog size intake, life stage, "
                    "training goals, and health priorities. First purchase includes "
                    "a dog health questionnaire."
                ),
                "concept": {
                    "name": "The Personalized Dog Health Subscription",
                    "description": (
                        "Onboarding quiz: dog weight, breed, age, current health goals "
                        "(training? dental? digestion? anxiety?). Monthly box ships the "
                        "right treat formulations in the right quantities. Includes a "
                        "monthly 'what changed' ingredient card. Brand identity: "
                        "nutrition transparency + outcomes tracking. "
                        "DTC first, Amazon subscription second."
                    ),
                    "usp": (
                        "The only dog treat subscription that knows your dog's name, "
                        "weight, and health goals before the first bag ships."
                    ),
                    "problems_solved": 3,
                    "intensity": 78,
                    "frequency": 85,
                    "solution_gap": 85,
                    "addressable_market": 68,
                    "brandability": 95,
                },
            },
        ],
    },

    # ── 3. The Home Yoga + Strength Woman ────────────────────────────────────
    # Source categories: yoga_mats + resistance_bands (same customer, top 4 and 5)
    {
        "archetype": "The Home Yoga + Strength Woman",
        "description": (
            "28–42 years old. Practices yoga 2–3x per week and does resistance "
            "training at home 3x per week. Limited space. Has drifted away from "
            "the gym (cost, time, anxiety). Wants a real practice, not random "
            "YouTube videos. Invests in wellness but is frustrated by generic gear "
            "that doesn't match her actual level of commitment."
        ),
        "source_categories": ["yoga_mats", "resistance_bands"],
        "market_data": {
            "demand": 72,
            "competition": 100,
            "subscription": 32,
            "trend": 15,
            "gap": 60,
            "suspicious_rate": 0.60,
            "market_size": "~$1.7B (yoga $600M + home fitness $1.1B)",
        },
        "all_pain_points": [
            "Mat slips during hot yoga — loses alignment mid-flow",
            "Resistance bands snap or roll during leg and glute exercises",
            "No progressive structure — plateaus without a defined program",
            "Yoga and strength training feel disconnected — no system bridges them",
            "Recovery is neglected — soreness causes skipped sessions",
            "Generic loop bands don't target glutes specifically",
            "Heavy mat is inconvenient to carry between home and studio",
            "Home practice feels less 'real' than going to a studio",
            "No accountability — motivation drops without community",
            "Two separate expensive product categories for one body, one practice",
        ],
        "pain_clusters": [
            {
                "cluster_name": "The Grip-Strength-Recovery Triangle",
                "pain_points": [
                    "Mat slips during hot yoga — loses alignment mid-flow",
                    "Resistance bands snap or roll during leg and glute exercises",
                    "Recovery is neglected — soreness causes skipped sessions",
                ],
                "co_occurrence_reason": (
                    "These three physical failures occur within the same practice week "
                    "and each breaks the habit loop: slipping breaks flow, snapping "
                    "bands create frustration, soreness prevents the next session. "
                    "Solving all three removes the friction that causes abandonment."
                ),
                "unmet_need": (
                    "An integrated physical practice kit where grip, resistance, and "
                    "recovery are all addressed in a single branded system — not three "
                    "separate commodity purchases."
                ),
                "concept": {
                    "name": "The Complete Home Practice System",
                    "description": (
                        "One kit: (1) non-slip microfiber hot yoga towel with "
                        "silicone grip dots and integrated resistance band anchor "
                        "loops at the base; (2) 3 premium fabric glute resistance "
                        "bands (no snap, no roll, progressive resistance levels); "
                        "(3) compact foam roller for post-session release. "
                        "QR-code inside: 8-week progressive program combining yoga "
                        "flow with strength work. Free app access included."
                    ),
                    "usp": (
                        "The first kit that connects your yoga practice to your "
                        "strength training. One mat. One system. Zero excuses."
                    ),
                    "problems_solved": 4,
                    "intensity": 85,
                    "frequency": 90,
                    "solution_gap": 92,
                    "addressable_market": 75,
                    "brandability": 90,
                },
            },
            {
                "cluster_name": "The Commitment-Identity Gap",
                "pain_points": [
                    "Home practice feels less 'real' than going to a studio",
                    "No accountability — motivation drops without community",
                    "No progressive structure — plateaus without a defined program",
                ],
                "co_occurrence_reason": (
                    "This customer is committed in identity ('I'm a yogi') but the "
                    "physical environment (generic Amazon gear, no structure) doesn't "
                    "match the identity. Premium products signal seriousness to the "
                    "self — this is why Lululemon charges $100+ for leggings."
                ),
                "unmet_need": (
                    "A brand that treats the home practitioner as a serious athlete, "
                    "not a casual fitness consumer. The product should feel like "
                    "studio-grade equipment for the home."
                ),
                "concept": {
                    "name": "Studio-Grade Home Practice Brand",
                    "description": (
                        "Premium positioning ($75–$95 kit) with materials that signal "
                        "quality: natural rubber mat base, organic cotton towel layer, "
                        "woven fabric resistance bands. Includes access to a private "
                        "practice community (Discord or app-based) with weekly "
                        "programming. The brand voice: serious practitioner, "
                        "not fitness influencer."
                    ),
                    "usp": (
                        "Studio quality at home. Because your practice is real "
                        "whether or not you pay studio rent."
                    ),
                    "problems_solved": 3,
                    "intensity": 78,
                    "frequency": 85,
                    "solution_gap": 85,
                    "addressable_market": 65,
                    "brandability": 94,
                },
            },
            {
                "cluster_name": "The Glute-Specific Training Gap",
                "pain_points": [
                    "Generic loop bands don't target glutes specifically",
                    "Resistance bands snap or roll during leg and glute exercises",
                    "No progressive structure — plateaus without a defined program",
                ],
                "co_occurrence_reason": (
                    "Women's home fitness is overwhelmingly glute-goal-oriented, "
                    "but 100% of the top resistance band products are generic "
                    "'5-band sets for everyone.' A glute-specific system with "
                    "appropriate resistance levels and a guided program addresses "
                    "the actual training goal, not a generic market."
                ),
                "unmet_need": (
                    "Bands designed specifically for glute activation patterns: "
                    "wider width (more surface area), anti-roll grip texture, "
                    "and resistance levels calibrated to glute strength curves."
                ),
                "concept": {
                    "name": "The Glute Lab Home Training System",
                    "description": (
                        "3 fabric bands designed specifically for glute exercises "
                        "(wider than standard, silicone-grip inner lining, "
                        "hip-flexion optimized resistance levels). Includes: "
                        "12-week progressive glute program (QR code, video-guided), "
                        "resistance level guide based on body weight, and a "
                        "measurement tracker card. Positioned: science-backed, "
                        "not influencer-backed. Premium price $38–$45."
                    ),
                    "usp": (
                        "Bands built for glutes, not for everything. "
                        "12 weeks of progressive programming included."
                    ),
                    "problems_solved": 3,
                    "intensity": 88,
                    "frequency": 88,
                    "solution_gap": 88,
                    "addressable_market": 68,
                    "brandability": 88,
                },
            },
        ],
    },

    # ── 4. The Aesthetic Home Chef ────────────────────────────────────────────
    # Source categories: cooking_utensils + potholders (same kitchen, same buyer)
    {
        "archetype": "The Aesthetic Home Chef",
        "description": (
            "28–42 years old. Cooks seriously at home. Has a food TikTok or Instagram, "
            "or aspires to. Frustrated by generic black silicone sets. Wants a kitchen "
            "that looks intentional. Cooks for guests, photographs food, and feels that "
            "ugly tools diminish the experience. Spends $50–$200 on kitchen tools "
            "annually but can't find a brand they love."
        ),
        "source_categories": ["cooking_utensils", "potholders"],
        "market_data": {
            "demand": 30,
            "competition": 100,
            "subscription": 20,
            "trend": 50,
            "gap": 80,
            "suspicious_rate": 0.78,
            "market_size": "~$1.4B kitchen tools + protection",
        },
        "all_pain_points": [
            "Kitchen cluttered with 28 useless tools from 33-piece sets",
            "Generic black/gray silicone looks cheap and doesn't photograph well",
            "Utensil handles stain or degrade after dishwasher use",
            "Can't find a kitchen brand with an aesthetic identity worth gifting",
            "Oven mitts fail above 400°F, creating safety risk for cast iron use",
            "Cheap mitts deteriorate visually after 3–4 washes",
            "Matching kitchen tools and mitts requires buying from multiple brands",
            "Cooking content requires aesthetically interesting tools as visual props",
            "No minimalist 'essentials only' option — everything sold as big sets",
            "Fake reviews make it impossible to judge quality before buying",
        ],
        "pain_clusters": [
            {
                "cluster_name": "The Aesthetic Kitchen Identity Gap",
                "pain_points": [
                    "Generic black/gray silicone looks cheap and doesn't photograph well",
                    "Matching kitchen tools and mitts requires buying from multiple brands",
                    "Can't find a kitchen brand with an aesthetic identity worth gifting",
                ],
                "co_occurrence_reason": (
                    "The home chef who cares about kitchen aesthetics cannot find a "
                    "single brand that covers both tools and protection in a matched "
                    "visual system. The gap is a brand identity gap, not a product "
                    "gap. 78% of scored products are suspicious — the market is "
                    "brand-less."
                ),
                "unmet_need": (
                    "A premium kitchen aesthetic brand where every piece in a "
                    "collection matches: spatula, spoon, tongs, oven mitts, pot "
                    "holders — all in the same material palette and color story. "
                    "Designed to look beautiful hanging in a kitchen."
                ),
                "concept": {
                    "name": "The Kitchen Capsule Brand",
                    "description": (
                        "Annual seasonal collections (Sage, Terracotta, Slate) covering "
                        "5 essential utensils + a 2-piece oven mitt set. All stainless "
                        "steel core with swappable silicone heads (utensils) and "
                        "matching linen/silicone mitts. Every item in the collection "
                        "ships in the same packaging, designed to be gifted. "
                        "Price: $65 utensil set + $35 mitt set. "
                        "Brand: 'the kitchen capsule wardrobe.'"
                    ),
                    "usp": (
                        "Your kitchen has a wardrobe. These are the essentials. "
                        "Pick your palette. Own the whole collection."
                    ),
                    "problems_solved": 3,
                    "intensity": 75,
                    "frequency": 60,
                    "solution_gap": 92,
                    "addressable_market": 65,
                    "brandability": 96,
                },
            },
            {
                "cluster_name": "The Content Creator's Kitchen Problem",
                "pain_points": [
                    "Cooking content requires aesthetically interesting tools as visual props",
                    "Generic black/gray silicone looks cheap and doesn't photograph well",
                    "No minimalist 'essentials only' option — everything sold as big sets",
                ],
                "co_occurrence_reason": (
                    "Food content creation is one of the fastest growing creator niches. "
                    "Creators need tools that are props as much as they are functional. "
                    "A 33-piece set clutters the frame. A curated 3-piece set becomes "
                    "part of the visual brand."
                ),
                "unmet_need": (
                    "A 'creator kitchen kit' — 3–5 tools photographed specifically "
                    "in real cooking content, sold with a style guide showing how "
                    "to use them as props."
                ),
                "concept": {
                    "name": "The Food Creator Kitchen Trio",
                    "description": (
                        "3 tools curated for how they look ON camera, not just how "
                        "they function: (1) matte stainless spatula with olive wood "
                        "handle; (2) matching whisk; (3) silicone spoon in seasonal "
                        "color. Sold with a 'how to use tools as props' visual guide. "
                        "TikTok-first launch strategy: seed creator kits to food "
                        "creators in exchange for content. Premium $48 per trio."
                    ),
                    "usp": (
                        "Three tools that look as good in your content as they work "
                        "in your kitchen."
                    ),
                    "problems_solved": 3,
                    "intensity": 72,
                    "frequency": 75,
                    "solution_gap": 88,
                    "addressable_market": 58,
                    "brandability": 90,
                },
            },
            {
                "cluster_name": "The Safety + Aesthetics Mismatch",
                "pain_points": [
                    "Oven mitts fail above 400°F, creating safety risk for cast iron use",
                    "Cheap mitts deteriorate visually after 3–4 washes",
                    "Kitchen cluttered with 28 useless tools from 33-piece sets",
                ],
                "co_occurrence_reason": (
                    "The home chef who uses cast iron or does high-heat baking is "
                    "under-served: generic mitts aren't rated for the temperatures "
                    "involved, and they look terrible. The safety need and the "
                    "aesthetic need are both unmet simultaneously."
                ),
                "unmet_need": (
                    "A premium oven mitt that is rated to 932°F AND beautiful enough "
                    "to hang on display in a styled kitchen. The product needs to "
                    "pass both a safety test and a photography test."
                ),
                "concept": {
                    "name": "The Cast Iron Cook's Protection Set",
                    "description": (
                        "Long-form silicone oven mitt (rated 932°F) with a linen "
                        "exterior shell in seasonal color. Includes matching trivets. "
                        "Designed specifically for cast iron and Dutch oven cooking. "
                        "Certifications (heat rating) displayed on packaging. "
                        "Price: $38–$45. Brand voice: serious home cook, not hobby baker."
                    ),
                    "usp": (
                        "932°F rated. Beautiful enough to display. "
                        "Built for cast iron, not just for show."
                    ),
                    "problems_solved": 3,
                    "intensity": 80,
                    "frequency": 65,
                    "solution_gap": 85,
                    "addressable_market": 55,
                    "brandability": 88,
                },
            },
        ],
    },

    # ── 5. The Home Entertainer ───────────────────────────────────────────────
    # Source categories: ice_cube_molds + reusable_straws (same hosting occasion)
    {
        "archetype": "The Home Entertainer",
        "description": (
            "30–45 years old. Hosts dinner parties and cocktail nights regularly. "
            "Follows cocktail TikTok, wants to impress guests without becoming a "
            "professional bartender. Drinks spirits mindfully. Embarrassed by "
            "basic presentation. Has $100–$200 to spend on bar/entertaining setup."
        ),
        "source_categories": ["ice_cube_molds", "reusable_straws"],
        "market_data": {
            "demand": 20,
            "competition": 100,
            "subscription": 25,
            "trend": 62,
            "gap": 68,
            "suspicious_rate": 0.48,
            "market_size": "~$330M cocktail accessories + eco drinkware",
        },
        "all_pain_points": [
            "Regular ice dilutes expensive spirits and cocktails within minutes",
            "Cocktail presentation looks basic compared to bar-quality drinks on TikTok",
            "No cohesive 'home bar' system — mismatched tools collected over time",
            "Preparing cocktails for 6 guests takes 20+ minutes of prep",
            "Ice sphere molds leak water all over the freezer",
            "Reusable straws don't match the aesthetic of the drink they're served in",
            "Plastic straws are embarrassing to use but metal straws taste metallic",
            "Infusing drinks with herbs/fruits requires specialist equipment",
            "Running out of ice mid-party creates awkward pauses",
            "Wants to look knowledgeable about cocktails but lacks recipes/confidence",
        ],
        "pain_clusters": [
            {
                "cluster_name": "The Cocktail Presentation System",
                "pain_points": [
                    "Regular ice dilutes expensive spirits and cocktails within minutes",
                    "Cocktail presentation looks basic compared to bar-quality drinks on TikTok",
                    "Infusing drinks with herbs/fruits requires specialist equipment",
                ],
                "co_occurrence_reason": (
                    "All three problems are about the same moment: the reveal of the "
                    "drink to a guest. Slow-melt sphere ice, a citrus peel garnish, "
                    "and a herb-infused cube all address the same 30-second window "
                    "of drink presentation. No single kit solves all three."
                ),
                "unmet_need": (
                    "A cocktail ice system that makes every drink look effortless: "
                    "sphere ice + infusion insert + garnish preparation included in "
                    "one kit that takes under 3 minutes to deploy."
                ),
                "concept": {
                    "name": "The Slow Ice Cocktail System",
                    "description": (
                        "Kit: (1) large sphere ice mold (leak-proof via silicone seal) "
                        "with an inner herb/fruit infusion chamber; (2) small cocktail "
                        "cube tray for highball drinks; (3) matching glass straws in "
                        "a color that complements the ice aesthetic; (4) included "
                        '\'cocktail host\' recipe card deck: "30 cocktails, 3 ingredients." '
                        "All pieces fit the same design language. Gift box included. "
                        "Price: $52–$65."
                    ),
                    "usp": (
                        "Sphere ice, herb infusion, matching straws, 30 recipes. "
                        "Everything you need to look like you know what you're doing."
                    ),
                    "problems_solved": 4,
                    "intensity": 78,
                    "frequency": 72,
                    "solution_gap": 90,
                    "addressable_market": 65,
                    "brandability": 88,
                },
            },
            {
                "cluster_name": "The Eco Aesthetic Mismatch",
                "pain_points": [
                    "Reusable straws don't match the aesthetic of the drink they're served in",
                    "Plastic straws are embarrassing to use but metal straws taste metallic",
                    "No cohesive 'home bar' system — mismatched tools collected over time",
                ],
                "co_occurrence_reason": (
                    "The eco-conscious host is caught between environmental values "
                    "(no plastic) and sensory experience (metal tastes wrong) and "
                    "aesthetic values (random straws don't match the drink). "
                    "Glass straws solve taste. Matching the design system solves aesthetics. "
                    "Both are unaddressed in the commodity straw market."
                ),
                "unmet_need": (
                    "A glass straw collection designed to match drink aesthetics: "
                    "clear for spirits, tinted for cocktails, wide for smoothies. "
                    "Sold as a set that visually belongs together."
                ),
                "concept": {
                    "name": "The Glass Straw Collection (By Drink Type)",
                    "description": (
                        "3-pack glass straws curated by drink occasion: "
                        "(1) clear straight 8mm for spirits; (2) colored angled 10mm "
                        "for cocktails; (3) wide 14mm for thick drinks. "
                        "Each straw has a matching silicone tip and cleaning brush. "
                        "Sold in a linen carry pouch for hosting. "
                        "Brand identity: 'the accessory for the drink, not the straw for the mouth.' "
                        "Price $28."
                    ),
                    "usp": (
                        "A glass straw for every drink. Designed to be seen, "
                        "not hidden."
                    ),
                    "problems_solved": 3,
                    "intensity": 70,
                    "frequency": 65,
                    "solution_gap": 85,
                    "addressable_market": 60,
                    "brandability": 82,
                },
            },
            {
                "cluster_name": "The Host Confidence Gap",
                "pain_points": [
                    "Preparing cocktails for 6 guests takes 20+ minutes of prep",
                    "Wants to look knowledgeable about cocktails but lacks recipes/confidence",
                    "Running out of ice mid-party creates awkward pauses",
                ],
                "co_occurrence_reason": (
                    "The host's anxiety is not about tools — it's about confidence "
                    "and preparation. The product that solves this is a 'hosting system' "
                    "that removes preparation friction and provides knowledge scaffolding."
                ),
                "unmet_need": (
                    "A hosting prep kit that makes cocktail hosting feel effortless: "
                    "pre-batched ice, recipe guidance, and quick-deploy tools "
                    "for groups of 4–8 people."
                ),
                "concept": {
                    "name": "The Cocktail Hosting Prep Kit (4–8 Guests)",
                    "description": (
                        "Kit designed around a hosting timeline: "
                        "(1) 4 large sphere molds + 2 large cube trays "
                        "(enough ice for 8 people, 2 cocktails each); "
                        "(2) 8 matching glass straws; (3) cocktail recipe card deck "
                        "with pre-batching instructions (make ahead of guests arriving); "
                        "(4) ice storage bag to keep spheres ready 2 hours before event. "
                        "Price: $78. Gift-ready packaging."
                    ),
                    "usp": (
                        "Prep at 4pm, host at 7pm. Everything done before guests arrive."
                    ),
                    "problems_solved": 3,
                    "intensity": 75,
                    "frequency": 55,
                    "solution_gap": 88,
                    "addressable_market": 58,
                    "brandability": 85,
                },
            },
        ],
    },

    # ── 6. The Home Decor Curator ─────────────────────────────────────────────
    # Source categories: candles (12/15 products under 1K reviews)
    {
        "archetype": "The Home Decor Curator",
        "description": (
            "26–38 years old. Curates their home environment intentionally. Shops "
            "for home decor seasonally. Gives home decor gifts. Follows home aesthetic "
            "TikTok and Instagram. Wants their home to feel like a designed space, "
            "not a collection of random Amazon purchases."
        ),
        "source_categories": ["candles"],
        "market_data": {
            "demand": 20,
            "competition": 100,
            "subscription": 65,
            "trend": 50,
            "gap": 32,
            "suspicious_rate": 0.0,
            "market_size": "~$500M candle accessories + home fragrance",
        },
        "all_pain_points": [
            "Tealight holders are either cheap/flimsy or over-designed for formal events",
            "Home decor feels generic — nothing signals a point of view or aesthetic identity",
            "Buying candles as gifts is risky — scent preferences are deeply personal",
            "Seasonal decor accumulates clutter; no system for transitioning aesthetics",
            "Setting up for dinner parties requires sourcing from 5 different places",
            "Fragrance in a room is either too strong (entire candle) or non-existent",
            "No subscription or 'edit' model for home accessories — everything is one-time",
            "Current options are either luxury-priced ($80+) or quality-compromised (<$15)",
            "Gifting home decor feels impersonal without a clear brand story",
            "The 'aesthetic home' TikTok trend creates aspiration but no obvious brand to shop",
        ],
        "pain_clusters": [
            {
                "cluster_name": "The Seasonal Aesthetic Transition",
                "pain_points": [
                    "Tealight holders are either cheap/flimsy or over-designed for formal events",
                    "Seasonal decor accumulates clutter; no system for transitioning aesthetics",
                    "The 'aesthetic home' TikTok trend creates aspiration but no obvious brand to shop",
                ],
                "co_occurrence_reason": (
                    "The 12/15 candle holder products under 1K reviews proves there is "
                    "no dominant brand in this space. A brand that owns 'seasonal home "
                    "aesthetic edits' could capture repeat purchasers without ever "
                    "competing on price — they compete on aesthetic curation."
                ),
                "unmet_need": (
                    "A brand that ships a cohesive seasonal 'home edit' of tealight "
                    "holders and accessories quarterly — so the home transforms with "
                    "the season without requiring the customer to shop or research."
                ),
                "concept": {
                    "name": "The Seasonal Home Edit (Quarterly Decor Subscription)",
                    "description": (
                        "Quarterly subscription: each edit contains 6 tealight holders "
                        "in a seasonal palette (matte terracotta for fall, frosted glass "
                        "for winter, natural rattan for spring, minimal ceramic for summer). "
                        "Designed to be placed, photographed, and gifted. "
                        "Includes a 'room styling' card showing 3 arrangement options. "
                        "Price: $38/quarter. Gift subscription option launches with holiday."
                    ),
                    "usp": (
                        "Your home, updated with the season. "
                        "Four times a year, without shopping."
                    ),
                    "problems_solved": 3,
                    "intensity": 70,
                    "frequency": 85,
                    "solution_gap": 90,
                    "addressable_market": 60,
                    "brandability": 95,
                },
            },
            {
                "cluster_name": "The Gifting Confidence Gap",
                "pain_points": [
                    "Buying candles as gifts is risky — scent preferences are deeply personal",
                    "Gifting home decor feels impersonal without a clear brand story",
                    "Current options are either luxury-priced ($80+) or quality-compromised (<$15)",
                ],
                "co_occurrence_reason": (
                    "Gift givers want to spend $25–$45 on something that looks premium "
                    "and feels personal without the scent risk. A candle HOLDER brand "
                    "at that price point — with a brand story — eliminates the scent "
                    "risk while still feeling intentional."
                ),
                "unmet_need": (
                    "A gifting brand for home decor that sits at the $28–$45 price "
                    "point, looks premium, and requires zero knowledge of the recipient's "
                    "tastes — because the design is neutral enough to fit any aesthetic."
                ),
                "concept": {
                    "name": "The Gift-Ready Home Candle Set",
                    "description": (
                        "Set of 4 minimal geometric tealight holders (matte ceramic, "
                        "neutral palette) with 10 unscented soy tealights included. "
                        "Presented in a kraft gift box with a hand-written card insert. "
                        "Can be personalized with a name or message (Shopify custom order). "
                        "Brand positioning: 'the gift for the home you haven't seen.' "
                        "Price $34. Gift note included free."
                    ),
                    "usp": (
                        "A home gift that needs no knowledge of their taste. "
                        "Minimal enough to match anything. Beautiful enough to display."
                    ),
                    "problems_solved": 3,
                    "intensity": 72,
                    "frequency": 60,
                    "solution_gap": 88,
                    "addressable_market": 72,
                    "brandability": 90,
                },
            },
            {
                "cluster_name": "The Ambient Scent Control Gap",
                "pain_points": [
                    "Fragrance in a room is either too strong (entire candle) or non-existent",
                    "Setting up for dinner parties requires sourcing from 5 different places",
                    "No subscription or 'edit' model for home accessories — everything is one-time",
                ],
                "co_occurrence_reason": (
                    "The home entertainer wants ambient scent but not the full candle "
                    "experience (wax, flame management, burning time). Tealights in "
                    "aesthetic holders solve the ambient issue but no brand has "
                    "positioned around this specific use case."
                ),
                "unmet_need": (
                    "A micro-fragrance system: small, controlled scent via scented "
                    "tealights in beautiful holders that burns for 4 hours (dinner "
                    "length), not 40 hours (full candle)."
                ),
                "concept": {
                    "name": "The Dinner Table Scent System",
                    "description": (
                        "6 aesthetic holders + 24 scented soy tealights in 4 "
                        "seasonal scents (2 tealights per scent × 4 dinners). "
                        "Scents are food-complementary: citrus for summer meals, "
                        "spice for winter, herbal for spring gatherings. "
                        "Subscription: monthly tealight refill pack ($14). "
                        "Starter kit: $42. Designed specifically for dinner table use."
                    ),
                    "usp": (
                        "Dinner-length fragrance. No overpowering room scent. "
                        "Refill monthly."
                    ),
                    "problems_solved": 3,
                    "intensity": 68,
                    "frequency": 70,
                    "solution_gap": 85,
                    "addressable_market": 58,
                    "brandability": 88,
                },
            },
        ],
    },

    # ── 7. The Morning Wellness Ritualist ─────────────────────────────────────
    # Cross-category synthesis: whitening + yoga + candles = same customer
    {
        "archetype": "The Morning Wellness Ritualist",
        "description": (
            "30–42 years old. Wakes at 6am. Follows a morning routine: yoga, "
            "matcha or coffee, journaling, or some combination. Her home is curated. "
            "She spends $200–$400/month on wellness products. She wants every piece "
            "of her routine to feel intentional and match her aesthetic. "
            "She doesn't buy products — she buys routines."
        ),
        "source_categories": ["teeth_whitening", "yoga_mats", "candles"],
        "market_data": {
            "demand": 55,
            "competition": 90,
            "subscription": 88,
            "trend": 48,
            "gap": 82,
            "suspicious_rate": 0.55,
            "market_size": "~$2.9B (wellness routine products)",
        },
        "all_pain_points": [
            "Morning routine has 6–8 different brands that feel disconnected",
            "Whitening sensitivity disrupts the morning coffee ritual",
            "Yoga mat is functional but doesn't match the aesthetic of the wellness space",
            "Candles/ambiance are afterthoughts, not designed for morning practice",
            "No single brand understands the whole morning ritual",
            "Wellness products are either luxury-priced or Amazon-generic",
            "Subscription fatigue from 6+ individual wellness subscriptions",
            "Products that work don't look good; products that look good don't work",
            "Morning routine breaks when one product runs out unexpectedly",
            "No cohesive 'morning ritual brand' at a premium but accessible price",
        ],
        "pain_clusters": [
            {
                "cluster_name": "The Disconnected Routine Problem",
                "pain_points": [
                    "Morning routine has 6–8 different brands that feel disconnected",
                    "No single brand understands the whole morning ritual",
                    "No cohesive 'morning ritual brand' at a premium but accessible price",
                ],
                "co_occurrence_reason": (
                    "This customer's willingness to pay is high but her attention span "
                    "for discovery is low. She buys from brands she trusts, not from "
                    "categories. A brand that owns 'morning ritual products' across "
                    "oral care, movement, and ambiance creates radical retention."
                ),
                "unmet_need": (
                    "A brand that treats the morning routine as a single system: "
                    "the 45-minute ritual from waking to starting the day. "
                    "Products designed around the sequence, not the category."
                ),
                "concept": {
                    "name": "The Morning Ritual Brand",
                    "description": (
                        "Brand architecture: three product lines, one ritual. "
                        "Line 1 (Brighten): sensitivity-safe whitening pen + "
                        "remineralizing tooth serum. "
                        "Line 2 (Move): hot yoga grip towel + travel mat. "
                        "Line 3 (Ground): 3 morning ambiance tealights + holder. "
                        "Monthly subscription bundle: 'the morning ritual box' "
                        "ships the consumables on autopilot. "
                        "DTC-first, Amazon for discovery. "
                        "Brand voice: intention over intensity."
                    ),
                    "usp": (
                        "The first brand built around your morning, not around a product. "
                        "From teeth to mat to candlelight — one ritual, one brand."
                    ),
                    "problems_solved": 4,
                    "intensity": 82,
                    "frequency": 95,
                    "solution_gap": 95,
                    "addressable_market": 55,
                    "brandability": 98,
                },
            },
            {
                "cluster_name": "The Aesthetics-Function Mismatch",
                "pain_points": [
                    "Products that work don't look good; products that look good don't work",
                    "Yoga mat is functional but doesn't match the aesthetic of the wellness space",
                    "Candles/ambiance are afterthoughts, not designed for morning practice",
                ],
                "co_occurrence_reason": (
                    "Premium wellness buyers face a consistent binary: beautiful products "
                    "underperform, high-performance products are ugly. The opportunity is "
                    "a brand that dissolves this binary — equal emphasis on material "
                    "science and visual language."
                ),
                "unmet_need": (
                    "Wellness tools that are designed by a creative director AND "
                    "a materials engineer simultaneously. The yoga mat should feel "
                    "like it belongs next to the candles."
                ),
                "concept": {
                    "name": "The Wellness Aesthetic System",
                    "description": (
                        "Matched product pair designed for the same visual space: "
                        "(1) natural rubber yoga mat in earthy tones (sage, terracotta) "
                        "with integrated non-slip pattern; (2) ceramic tealight holder "
                        "set in the same palette. Both products designed by the same "
                        "creative director. Sold as a 'wellness space kit.' "
                        "Brand: studio-quality objects for home practice. "
                        "Price: $95 for the pair."
                    ),
                    "usp": (
                        "Your mat and your ambiance, designed together. "
                        "Because your practice space is intentional."
                    ),
                    "problems_solved": 3,
                    "intensity": 75,
                    "frequency": 80,
                    "solution_gap": 88,
                    "addressable_market": 52,
                    "brandability": 92,
                },
            },
        ],
    },

    # ── 8. The Eco-Minimalist Hydration Person ────────────────────────────────
    # Source categories: reusable_straws (replacement straw ecosystem)
    {
        "archetype": "The Eco-Minimalist Hydration Person",
        "description": (
            "24–36 years old. Owns a Stanley or Owala water bottle. "
            "Drinks water and smoothies habitually. Eco-conscious but not "
            "extreme. Wants products that reduce waste AND look good. "
            "Frustrated by straw accessories that don't fit their specific bottle."
        ),
        "source_categories": ["reusable_straws"],
        "market_data": {
            "demand": 20,
            "competition": 100,
            "subscription": 30,
            "trend": 50,
            "gap": 70,
            "suspicious_rate": 0.56,
            "market_size": "~$130M eco drinkware segment",
        },
        "all_pain_points": [
            "Replacement straws for specific bottles (Owala, Stanley) hard to find",
            "Metal straws leave a metallic taste that ruins the drinking experience",
            "Straw cleaning is annoying — brushes don't fit correctly",
            "Single straw purchase feels insufficient; lose one, the set is incomplete",
            "Eco credentials of 'reusable' products not actually transparent",
            "Glass straws are fragile — anxiety about breaking them in a bag",
            "Boba/smoothie straws need different width than water straws",
            "Straws as a category feel like a commodity with no brand worth supporting",
            "Subscription model doesn't exist for replacement straws",
            "Eco-conscious buyers want to vote with their wallet but can't find the right brand",
        ],
        "pain_clusters": [
            {
                "cluster_name": "The Bottle-Specific Replacement Ecosystem",
                "pain_points": [
                    "Replacement straws for specific bottles (Owala, Stanley) hard to find",
                    "Single straw purchase feels insufficient; lose one, the set is incomplete",
                    "Subscription model doesn't exist for replacement straws",
                ],
                "co_occurrence_reason": (
                    "The XZESH metal straw for Owala is doing $5,475/mo with clean "
                    "integrity and fewer than 1K reviews. The validated demand is real "
                    "and no brand has built an ecosystem around bottle-specific "
                    "replacement accessories."
                ),
                "unmet_need": (
                    "A replacement straw brand that maps products to specific "
                    "bottle models — Owala 24oz, Stanley 30oz, Hydro Flask 32oz — "
                    "with a subscription that auto-replenishes."
                ),
                "concept": {
                    "name": "The Bottle-Matched Straw Subscription",
                    "description": (
                        "Brand built around bottle compatibility: customer selects "
                        "their bottle model during signup. Receives 4 matched straws "
                        "(2 glass + 2 metal or silicone), cleaning brush, and "
                        "carry pouch. Every 3 months: 2 replacement straws auto-ship "
                        "($8/quarter). First box: $24. "
                        "Product page shows compatibility chart for 20 top bottle models. "
                        "Brand voice: 'made for your bottle, not any bottle.'"
                    ),
                    "usp": (
                        "The only straw brand that knows which bottle you own. "
                        "Ships straws that actually fit."
                    ),
                    "problems_solved": 3,
                    "intensity": 72,
                    "frequency": 75,
                    "solution_gap": 90,
                    "addressable_market": 68,
                    "brandability": 85,
                },
            },
        ],
    },
]

# ─────────────────────────────────────────────────────────────────────────────
# SCORING
# ─────────────────────────────────────────────────────────────────────────────

def score_concept(cluster: dict, market: dict, n_problems: int) -> float:
    c = cluster["concept"]
    # Raw component scores
    intensity   = c["intensity"]
    frequency   = c["frequency"]
    sol_gap     = c["solution_gap"]
    addressable = c["addressable_market"]
    brandable   = c["brandability"]
    # Multi-problem bonus (each additional problem solved adds 3 points)
    problem_bonus = (n_problems - 2) * 3
    # Market signals from category data
    market_bonus = (
        market.get("competition", 50) * 0.05 +   # more accessible = better
        market.get("subscription", 50) * 0.05 +   # subscription-eligible = better
        market.get("gap", 50) * 0.05              # bigger gap = better
    )
    base = (intensity * 0.25 + frequency * 0.25 + sol_gap * 0.25
            + addressable * 0.15 + brandable * 0.10)
    raw = base + problem_bonus + market_bonus
    return min(100, round(raw, 1))


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

def run():
    now_str = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    print(f"\n{'#'*72}")
    print(f"  CUSTOMER-PROBLEM-FIRST PL OPPORTUNITY ANALYSIS")
    print(f"  Starting from human pain points, not Amazon listings")
    print(f"  {now_str}")
    print(f"{'#'*72}")

    all_rows = []

    for profile in CUSTOMER_PROFILES:
        print(f"\n\n{'═'*72}")
        print(f"  TARGET CUSTOMER: {profile['archetype'].upper()}")
        print(f"{'═'*72}")
        print(f"\n  {profile['description']}\n")

        print(f"  Source categories: {', '.join(profile['source_categories'])}")
        m = profile["market_data"]
        print(f"  Market: {m['market_size']}")
        print(f"  Competition accessibility: {m['competition']}/100  |  Subscription signal: {m['subscription']}/100")
        print(f"  Suspicious rate in market: {m.get('suspicious_rate',0):.0%}")

        print(f"\n  TOP 10 PAIN POINTS:")
        for i, p in enumerate(profile["all_pain_points"], 1):
            print(f"    {i:02d}. {p}")

        for cluster in profile["pain_clusters"]:
            pl_score = score_concept(
                cluster,
                profile["market_data"],
                cluster["concept"]["problems_solved"],
            )
            c = cluster["concept"]

            print(f"\n  ── Pain Cluster: {cluster['cluster_name']} ──")
            print(f"  Co-occurring problems:")
            for pp in cluster["pain_points"]:
                print(f"    · {pp}")
            print(f"\n  WHY they co-occur:")
            print(f"    {cluster['co_occurrence_reason']}")
            print(f"\n  UNMET NEED:")
            print(f"    {cluster['unmet_need']}")
            print(f"\n  PRODUCT CONCEPT: {c['name']}")
            print(f"    {c['description']}")
            print(f"\n  USP: {c['usp']}")
            print(f"  Problems solved: {c['problems_solved']}  |  PL Score: {pl_score}/100")

            all_rows.append({
                "target_customer":     profile["archetype"],
                "customer_description":profile["description"][:120],
                "pain_cluster":        cluster["cluster_name"],
                "problems_solved":     c["problems_solved"],
                "co_occurring_problems": " | ".join(cluster["pain_points"]),
                "why_co_occur":        cluster["co_occurrence_reason"][:200],
                "market_demand":       m["market_size"],
                "existing_solutions":  f"Amazon commodity products — {m.get('suspicious_rate',0):.0%} suspicious review rate",
                "unmet_need":          cluster["unmet_need"],
                "suggested_product":   c["name"],
                "product_description": c["description"][:200],
                "unique_selling_proposition": c["usp"],
                "pl_opportunity_score": pl_score,
                "intensity_score":     c["intensity"],
                "frequency_score":     c["frequency"],
                "solution_gap_score":  c["solution_gap"],
                "addressable_market":  c["addressable_market"],
                "brandability":        c["brandability"],
                "source_categories":   ", ".join(profile["source_categories"]),
                "tiktok_shop_fit":     m.get("tiktok_fit", "HIGH"),
                "subscription_signal": m["subscription"],
            })

    # ── Global ranking ────────────────────────────────────────────────────────
    all_rows.sort(key=lambda x: x["pl_opportunity_score"], reverse=True)
    top25 = all_rows[:25]

    print(f"\n\n{'#'*72}")
    print(f"  TOP 25 CUSTOMER-FIRST PL OPPORTUNITIES — RANKED BY SCORE")
    print(f"{'#'*72}")

    for rank, r in enumerate(top25, 1):
        print(f"\n  #{rank:02d}  {r['pl_opportunity_score']}/100  |  "
              f"[{r['target_customer'].upper()}]")
        print(f"       {r['suggested_product']}")
        print(f"       Cluster: {r['pain_cluster']}")
        print(f"       Solves {r['problems_solved']} simultaneous problems")
        print(f"       USP: {r['unique_selling_proposition'][:75]}")

    # ── Write CSV ─────────────────────────────────────────────────────────────
    out = Path("customer_problem_opportunities.csv")
    fieldnames = [
        "rank", "target_customer", "pain_cluster", "problems_solved",
        "pl_opportunity_score", "unique_selling_proposition",
        "suggested_product", "product_description",
        "unmet_need", "co_occurring_problems", "why_co_occur",
        "market_demand", "existing_solutions",
        "intensity_score", "frequency_score", "solution_gap_score",
        "addressable_market", "brandability", "subscription_signal",
        "source_categories", "customer_description",
    ]
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        for rank, r in enumerate(top25, 1):
            w.writerow({"rank": rank, **r})

    print(f"\n\n  Saved: {out}  ({len(top25)} opportunities)")
    print(f"{'#'*72}\n")


if __name__ == "__main__":
    run()
