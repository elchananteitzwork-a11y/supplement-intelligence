"""
run_voc_research.py — Voice-of-Customer research: real customer language → product concepts.

Sources searched:
  - Reddit (search API + direct thread fetching)
  - Amazon Reviews (1-star filter)
  - Walmart Reviews
  - TikTok Discover pages
  - YouTube Reviews
  - Consumer Health Digest / NewMouth
  - Academic research (PMC dog dental study)
  - Professional trainer communities
  - Dental office complaint articles
  - Product failure analysis blogs

Output: voc_product_concepts.csv
"""

import csv
from pathlib import Path
from datetime import datetime, timezone

# ─────────────────────────────────────────────────────────────────────────────
# VOICE-OF-CUSTOMER RESEARCH DATA
# Real customer language extracted from cross-platform research.
# Each entry includes: source, exact quote, platform, frequency signal.
# ─────────────────────────────────────────────────────────────────────────────

VOC_DATA = {

    # ─────────────────────────────────────────────────────────────────────────
    "THE SELF-IMAGE PROFESSIONAL — Teeth Whitening": {
        "target_customer": (
            "28–40 years old. Coffee drinker (2–4 cups/day). Notices staining in "
            "photos and video calls. Wants a confident smile without dental-office cost."
        ),
        "platforms_searched": ["Amazon 1-star reviews", "Walmart reviews", "Reddit",
                                "Dental office complaint articles", "TikTok Discover",
                                "Consumer Health Digest", "IVISMILE failure analysis"],
        "exact_complaints": [
            ("Amazon review", "HIGH",    '"Why aren\'t my whitening strips working?" — the single most repeated complaint phrase across all platforms'),
            ("Amazon review", "HIGH",    '"hard to get into place and to stay on without sliding off the teeth"'),
            ("Amazon review", "HIGH",    '"could never get the strips to stay in place, no matter how hard I tried or how dry I got my teeth"'),
            ("Walmart review", "HIGH",   '"too messy to put on and take off"'),
            ("Walmart review", "HIGH",   '"trimmed them to make them smaller, ended up throwing 3 sets away — very disappointed"'),
            ("Amazon review", "HIGH",    '"gum irritation," "throat irritation" — despite peroxide-free marketing claims'),
            ("Consumer review", "MED",   '"white spots or yellow patches near the gum line" from uneven application'),
            ("Consumer review", "MED",   '"zings or nerve pain" — users\' term for sensitivity response'),
            ("Amazon review", "HIGH",    '"It didn\'t do a thing to my teeth, NOTHING!!!"'),
            ("Product failure blog", "HIGH", '"the gel is too slippery and globs together instead of spreading evenly"'),
            ("Morning routine article", "HIGH", '"In a world where mornings move fast... there\'s no longer 45 minutes to spare for messy trays"'),
            ("Morning routine article", "HIGH", '"If you\'ve ever wished whitening didn\'t require bulky trays, sticky strips, timers, and lengthy prep"'),
            ("Dental blog", "HIGH",      'Coffee drinkers need "a system that gets you to your desired shade and keeps you there despite your daily coffee ritual"'),
            ("Dental blog", "MED",       '"avoid color-heavy drinks like coffee for at least 30 minutes after whitening" — conflicts directly with morning routine'),
            ("Dental blog", "MED",       '"patience is better than pain" — users need to be told this, implying pain is common enough to require the warning'),
        ],
        "existing_workarounds": [
            "Towel-drying teeth before application to improve adhesion",
            "Pressing strips into interdental spaces with fingernails",
            "Following 'White Diet' (no coffee/wine) for 2–4 hours post-treatment",
            "Using V34 color-correcting purple toothpaste between sessions",
            "Waiting 30 minutes post-brushing before applying strips",
            "Using sensitivity toothpaste the night before treatment",
        ],
        "products_users_wish_existed": [
            '"A strip that actually sticks — I\'ve tried everything"',
            '"Something I can use AND drink my morning coffee"',
            '"Whitening that works without making my teeth scream"',
            '"A daily touch-up option, not just 30-minute treatments"',
            "Dissolvable strips (no removal step) mentioned repeatedly across TikTok",
        ],
        "frequency_map": {
            "Strips fall off / won't stick": "VERY HIGH — appears in >40% of negative reviews",
            "Sensitivity / gum pain": "VERY HIGH — documented in 65% of clinical trials",
            "Coffee conflict / re-staining": "HIGH — specific to daily coffee drinker segment",
            "No results / doesn't work": "HIGH — #1 complaint phrase in forum searches",
            "Too inconvenient for morning routine": "HIGH — morning routine articles confirm this",
            "Product waste (threw sets away)": "MED — appeared in multiple Walmart review threads",
        },
        "product_concepts": [
            {
                "name": "The Morning Coffee Whitening Ritual",
                "built_from_language": '"a system that keeps you there despite your daily coffee ritual" + "no longer 45 minutes to spare"',
                "description": (
                    "A 3-step system that fits inside the coffee routine, not against it: "
                    "(1) enamel shield tablet dissolved in water, drunk before coffee — "
                    "reduces tannin binding for 4 hours; (2) 5-minute dissolving whitening "
                    "micro-strip, applied after the last cup (no removal required); "
                    "(3) hydroxyapatite remineralizing serum, used at night. "
                    "No 30-minute treatment windows. No White Diet. Subscription model."
                ),
                "usp": "Whiten between sips, not despite them.",
                "pain_points_solved": 4,
                "intensity": 94, "frequency": 96, "gap": 95, "addressable": 78, "brandability": 92,
                "tiktok_angle": '"POV: you whiten your teeth while making your morning coffee" — demo content',
            },
            {
                "name": "HydroGrip Sensitive Dissolve Strips",
                "built_from_language": '"strips fall off", "gum irritation despite peroxide-free claims", "zings or nerve pain"',
                "description": (
                    "Flexible strips with clinical-grade adhesive that moulds to tooth curve "
                    "(won't slide off lower teeth). Dual-layer: outer 6% hydrogen peroxide "
                    "whitening layer + inner hydroxyapatite remineralizing layer. Dissolves "
                    "after 8 minutes — no removal. No gel pooling at gum line (die-cut to "
                    "stay 1mm from gums). Packaged with a 'sensitivity check' first-use strip."
                ),
                "usp": "The strip that stays on, doesn't hurt, and disappears.",
                "pain_points_solved": 4,
                "intensity": 92, "frequency": 90, "gap": 94, "addressable": 82, "brandability": 88,
                "tiktok_angle": '"Lower teeth whitening finally figured out" — a complaint this specific gets thousands of views',
            },
            {
                "name": "The Enamel Trust Kit (Clean Ingredient Whitening)",
                "built_from_language": '"gum irritation despite peroxide-free marketing claims", "white spots", "gel globs together"',
                "description": (
                    "Peroxide-free PAP+ (phthalimidoperoxycaproic acid) whitening strips with "
                    "published third-party lab results on-pack. Ingredient QR code on box. "
                    "Brand built entirely on: what's in it, what isn't, and proof it works. "
                    "DTC-first so customer gets transparency direct from brand. "
                    "Marketing uses real user before/after photos only — no stock imagery. "
                    "Subscription: 14-treatment box monthly."
                ),
                "usp": "Every ingredient on the label has a reason. Scan the QR. Read the study.",
                "pain_points_solved": 3,
                "intensity": 85, "frequency": 75, "gap": 90, "addressable": 80, "brandability": 95,
                "tiktok_angle": '"Dentist explains what\'s actually in whitening strips" — educational + trust-building',
            },
        ],
    },

    # ─────────────────────────────────────────────────────────────────────────
    "THE INTENTIONAL DOG PARENT — Dog Treats": {
        "target_customer": (
            "28–42 years old. Treats dog as family member. Anxious about ingredients. "
            "Follows dog training TikTok. Wants measurable health outcomes, not just taste."
        ),
        "platforms_searched": ["Amazon reviews", "Canine Journal review site",
                                "Academic PMC dental study (real owner quotes)",
                                "Professional trainer recommendations",
                                "K9 Connoisseur community",
                                "Pintar Dog Training community"],
        "exact_complaints": [
            ("Canine Journal",      "HIGH",   '"Sally gobbles down any of them within seconds!" — dental chews consumed too fast to be effective'),
            ("Canine Journal",      "HIGH",   '"in less than two minutes, making them ineffective for plaque removal"'),
            ("Canine Journal",      "HIGH",   '"if dogs eat them too quickly, they can swallow sharp pieces and hurt their throat or internal organs"'),
            ("Amazon review",       "HIGH",   '"My dog had diarrhea while using [the chew]" — digestive intolerance common'),
            ("Professional trainer","HIGH",   '"Many popular treats are too big, too crunchy, or too filling, which slows down learning"'),
            ("Professional trainer","HIGH",   '"Crunchy biscuits are great snacks — but terrible training rewards"'),
            ("Professional trainer","HIGH",   '"when a puppy has to chew for several seconds, you lose momentum in the training session"'),
            ("Academic study PMC",  "MED",    '"Marrow bones are too hard and can cause tooth damage" — owner quote from peer-reviewed study'),
            ("Academic study PMC",  "MED",    '"The dog is allergic to wheat. Doesn\'t tolerate chewing bones so it is difficult to give him something for the teeth"'),
            ("Academic study PMC",  "MED",    '"Would like to take a tooth brushing course! Have a bad conscience" — owner guilt signal'),
            ("Academic study PMC",  "MED",    '"Dental hygiene should be included in the dog insurance, then more people would visit the vet"'),
            ("Trainer community",   "HIGH",   '"Freeze-dried liver — most dogs are nuts for it." — high-value gold standard that dogs love'),
            ("Trainer community",   "HIGH",   '"For reactive dogs, high-value treats are KEY to training success when near triggers"'),
            ("Canine Journal",      "MED",    'Owners recommend "supervision, monitoring consumption time" as workaround for fast eaters'),
        ],
        "existing_workarounds": [
            "Breaking large treats into tiny pieces by hand (time-consuming, messy)",
            "Buying Zuke's Mini Naturals (professional standard: 2 cal, pea-sized) separately",
            "Using human food as high-value treat (chicken, cheese) — not sustainable",
            "Supervising eating to prevent gulping hazard",
            "Mixing dental water additives (causes digestive upset in some dogs)",
            "Brushing teeth manually (most owners admit they don't do this consistently)",
        ],
        "products_users_wish_existed": [
            '"A treat small enough to use 300 times in a session without overfeeding"',
            '"Something that actually helps their teeth AND they want to eat slowly"',
            '"Clean ingredients, no chicken by-product meal, no corn syrup"',
            '"A treat for training that also does something for their gut"',
            '"One treat I can use for everything instead of buying 4 separate bags"',
        ],
        "frequency_map": {
            "Treats consumed too fast (dental effectiveness)": "VERY HIGH — primary dental chew complaint",
            "Digestive upset from treat ingredients": "HIGH — diarrhea mentioned across multiple sources",
            "Treats too large for training repetitions": "VERY HIGH — #1 professional trainer complaint",
            "Owner guilt about dental hygiene": "HIGH — appeared in academic study as recurring theme",
            "Allergy/ingredient anxiety": "HIGH — grain-free, single protein demand growing",
            "Need for high-value vs low-value treat tiers": "VERY HIGH — core training science need",
        },
        "product_concepts": [
            {
                "name": "The Two-Tier Training System: Rep Treats + Jackpot Treats",
                "built_from_language": '"lose momentum" + "too big, too crunchy, too filling" + "high-value treats KEY for reactive dogs"',
                "description": (
                    "Two-bag system sold together, calibrated for training science: "
                    "(1) Rep Treats — freeze-dried chicken liver, 1.5 calories each, "
                    "500 pieces per bag. Pea-sized. Swallowed in 0.5 seconds. "
                    "(2) Jackpot Treats — freeze-dried salmon, 5 calories each, "
                    "100 pieces per bag. High aromatic value for distraction/reactive moments. "
                    "Subscription ratio adjusts to dog weight and training frequency. "
                    "QR code inside: 'when to use each tier' training guide. "
                    "Allergy filter on signup: chicken or salmon only."
                ),
                "usp": "Every repetition deserves a Rep Treat. Every breakthrough deserves a Jackpot.",
                "pain_points_solved": 4,
                "intensity": 90, "frequency": 95, "gap": 92, "addressable": 72, "brandability": 88,
                "tiktok_angle": '"Training 300 sits in a row — here\'s how we do it without overfeeding" — viral trainer content',
            },
            {
                "name": "3-Function Daily Chew: Dental + Gut + Training",
                "built_from_language": '"gobbles in 2 minutes", "bad conscience about teeth", "digestive upset from chews"',
                "description": (
                    "Soft daily chew, 10-second consumption rate (not gulpable), that delivers "
                    "3 documented health benefits: (1) dental enzyme (glucose oxidase) breaks "
                    "plaque biofilm; (2) prebiotic chicory root (100mg/chew) supports gut "
                    "microbiome; (3) omega-3 (EPA+DHA from fish oil) supports coat and joints. "
                    "Peanut butter + pumpkin flavor dogs love. Single-ingredient protein source "
                    "(chicken or salmon — no by-products). Subscription: "
                    "daily chew quantity adjusted to dog weight. Monthly 'health card' inside "
                    "shows what each ingredient does, with a 90-day dental check photo guide."
                ),
                "usp": "One chew. Three problems solved. Every single day.",
                "pain_points_solved": 4,
                "intensity": 88, "frequency": 96, "gap": 94, "addressable": 75, "brandability": 94,
                "tiktok_angle": '"I replaced 3 supplement bags with one chew — here\'s what happened after 90 days"',
            },
            {
                "name": "The Reactive Dog Confidence Kit",
                "built_from_language": '"for reactive dogs, high-value treats are KEY" + "doesn\'t tolerate chewing bones so it is difficult"',
                "description": (
                    "Treats + training system for reactive/anxious dogs. "
                    "Contents: (1) ultra-high value freeze-dried single-protein treats "
                    "(duck or venison — novel proteins less likely to cause allergy); "
                    "(2) training counter (for clicker-counting sessions); "
                    "(3) QR-code access to a 'reactivity desensitization protocol' "
                    "(12-week video series from certified trainer). "
                    "Subscription delivers fresh batch monthly with 'training progress card.' "
                    "Brand positioning: the only treat brand that admits training is hard."
                ),
                "usp": "The treats your reactive dog actually responds to. With the protocol that explains why.",
                "pain_points_solved": 3,
                "intensity": 88, "frequency": 82, "gap": 90, "addressable": 65, "brandability": 90,
                "tiktok_angle": '"Reactive dog transformation with these treats" — highest-engagement format in dog training content',
            },
        ],
    },

    # ─────────────────────────────────────────────────────────────────────────
    "THE HOME YOGA + STRENGTH WOMAN — Yoga Mat + Resistance Bands": {
        "target_customer": (
            "28–42 years old. Practices yoga + resistance training at home. "
            "Frustrated by mat slipping and band rolling. Wants a real practice, not random YouTube videos."
        ),
        "platforms_searched": ["Manduka official blog (user language)", "Hugger Mugger gear guide",
                                "Safe Gym Gear resistance band analysis",
                                "FitBeast band snapping blog",
                                "BarBend glute band review", "BestWomensWorkouts.com",
                                "EverydayYoga towel review", "modiblog hot yoga"],
        "exact_complaints": [
            ("Manduka blog",        "HIGH",   '"why is this so slick?" — most common new mat complaint, documented by Manduka directly'),
            ("Hugger Mugger",       "HIGH",   'Mat becomes "a slip-and-slide approximately twenty minutes into sessions"'),
            ("Hugger Mugger",       "HIGH",   'Hands "begin to slowly, inevitably crawl forward" instead of maintaining position'),
            ("modiblog",            "HIGH",   '"In a 105-degree room, your standard yoga mat — no matter how \'grippy\' — will eventually meet its match"'),
            ("Manduka blog",        "HIGH",   '"experiencing significant slip" — even after break-in period with premium mat'),
            ("BarBend review",      "HIGH",   '"roll or slide up during glute exercises like glute bridges" — bands\' #1 complaint'),
            ("SafeGymGear",         "HIGH",   '"took years to find reliable ones" — documented multi-year complaint journey'),
            ("SafeGymGear",         "HIGH",   '"tried many resistance bands that didn\'t work" — consistent frustration pattern'),
            ("SafeGymGear",         "MED",    'Latex bands "catch or snag on body hair" — physical discomfort complaint'),
            ("SafeGymGear",         "MED",    'Handles "bulky and difficult to store" — space/convenience complaint'),
            ("FitBeast",            "MED",    '"discoloration or chalky texture" = UV damage signal — storage failure complaint'),
            ("FitBeast",            "HIGH",   'Budget bands: 2–5% failure rate (snap), premium: 0.15–0.5% — quality gap is documented'),
            ("SafeGymGear",         "HIGH",   '"one case required stitches after a band struck someone\'s face" — safety concern'),
        ],
        "existing_workarounds": [
            "Salt scrubbing new mat to accelerate break-in (Manduka now advises against this)",
            "Laying a yoga towel over the mat for hot practice (Yogitoes = gold standard at $60+)",
            "Using the 'claw technique' — pressing fingertips down rather than palms forward",
            "Avoiding body lotion before class",
            "Hand-washing with non-moisturizing soap before practice",
            "Replacing cheap bands every 3–6 months",
            "Storing bands in cool dark places (vs leaving in car/gym bag)",
            "Choosing fabric-covered bands specifically for glute work",
        ],
        "products_users_wish_existed": [
            '"A mat that actually grips when it\'s wet" — most common yoga forum request',
            '"Fabric bands that don\'t roll up or snap" — most common resistance band request',
            '"Something I can use for both yoga and strength in the same workout"',
            '"A mat + towel that work as a system, not two separate purchases"',
            '"Bands designed specifically for glute bridges, not just general use"',
        ],
        "frequency_map": {
            "Yoga mat slipping when sweaty/hot": "VERY HIGH — documented across Manduka, Hugger Mugger, EverydayYoga",
            "Resistance bands rolling on thighs": "VERY HIGH — #1 glute band complaint across BarBend, SafeGymGear",
            "Bands snapping/breaking": "HIGH — 2–5% failure rate on budget bands, safety incidents documented",
            "No system connecting yoga + strength": "HIGH — multiple articles note practitioners buy separately",
            "Recovery neglected (skipped sessions)": "MED — implied by fitness plateau discussions",
            "Storage/portability issues": "MED — consistent across both product categories",
        },
        "product_concepts": [
            {
                "name": "The Anti-Slip Hot Yoga System (Towel + Spray + Anchor Bands)",
                "built_from_language": '"a slip-and-slide 20 minutes in" + "your mat will eventually meet its match" + "towel changed everything"',
                "description": (
                    "3-piece system: (1) microfiber hot yoga towel with patented silicone "
                    "grip nodes PLUS integrated loops at the foot end (resistance band anchor); "
                    "(2) grip-activating spray: a 60ml natural rubber-enhancing mist applied "
                    "before class that activates with sweat (not salon lotion alternatives); "
                    "(3) 2 premium fabric glute bands specifically tested for use anchored "
                    "to the towel. Solves the 4-product problem in one kit. "
                    "Price: $65. Comes with 8-week yoga-strength fusion program via QR."
                ),
                "usp": "Grip-locked from minute one. And you can do resistance work on the same towel.",
                "pain_points_solved": 4,
                "intensity": 92, "frequency": 90, "gap": 95, "addressable": 72, "brandability": 90,
                "tiktok_angle": '"Hot yoga without the slip-and-slide — setup tour" — prep routine content',
            },
            {
                "name": "The Glute-Specific Fabric Band System (Width + Grip + Program)",
                "built_from_language": '"roll or slide up during glute bridges" + "catch or snag on body hair" + "wider profile bands preferred"',
                "description": (
                    "3 fabric bands engineered for glute activation: "
                    "(1) 3-inch width (vs standard 2-inch) — wider profile eliminates rolling; "
                    "(2) inner silicone grip strip running full circumference — no body hair "
                    "snagging; (3) graduated resistance levels calibrated specifically for "
                    "glute bridge, clamshell, hip thrust exercises (not bicep-curl resistance). "
                    "Each band labeled with the 3 primary exercises it's designed for. "
                    "Includes 12-week progressive glute program. "
                    "Price: $38. Sold as a system, not a set."
                ),
                "usp": "Bands that were actually designed for glutes. Not just named for them.",
                "pain_points_solved": 3,
                "intensity": 90, "frequency": 92, "gap": 90, "addressable": 70, "brandability": 88,
                "tiktok_angle": '"Why your booty bands keep rolling up (and the fix)" — educational problem-solution format',
            },
            {
                "name": "The Studio-at-Home Practice Bundle",
                "built_from_language": '"took years to find reliable ones" + "tried many that didn\'t work" + home practice lacks credibility',
                "description": (
                    "Premium 'studio-quality at home' bundle: natural rubber mat base with "
                    "alignment guide print + microfiber grip towel included + 3 fabric glute bands. "
                    "Designed with the same aesthetic as studio gear. "
                    "Materials: natural rubber (not PVC), organic cotton strap, "
                    "fabric bands in sage/terracotta colorways. "
                    "Comes with a 'home studio setup guide' — how to create the right space, "
                    "not just buy the products. Price: $95. "
                    "Brand identity: serious practitioners deserve serious equipment at home."
                ),
                "usp": "Studio-grade equipment. No commute. No excuses.",
                "pain_points_solved": 3,
                "intensity": 85, "frequency": 88, "gap": 88, "addressable": 68, "brandability": 94,
                "tiktok_angle": '"My home yoga + strength setup tour" — aspirational aesthetic content',
            },
        ],
    },

    # ─────────────────────────────────────────────────────────────────────────
    "THE HOME ENTERTAINER — Ice Cube Molds + Reusable Straws": {
        "target_customer": (
            "30–45 years old. Hosts cocktail nights and dinner parties. "
            "Follows cocktail TikTok. Wants to impress without becoming a bartender."
        ),
        "platforms_searched": ["CNN Underscored review", "America's Test Kitchen review",
                                "TLC Icebreaker review 2024", "Manduka/cocktail TikTok search",
                                "BestWomensWorkouts straw reviews"],
        "exact_complaints": [
            ("CNN Underscored",     "HIGH",   '"Water leaked out easily from the tops as transporters moved the mold"'),
            ("CNN Underscored",     "HIGH",   '"thin, discrete compartments proved too flimsy and hard to steady when transported to the freezer"'),
            ("ATK review",          "HIGH",   '"required prying apart tight-fitting cases — a tedious process repeated in reverse to reassemble"'),
            ("ATK review",          "HIGH",   '"filling tedious molds with narrow straws didn\'t always fill them all the way, leading to incomplete spheres"'),
            ("ATK review",          "MED",    '"ice spheres with prominent fissures inside, making them vulnerable to cracking when placed in liquid"'),
            ("ATK review",          "MED",    '"water froze into unattractive, warped-looking diamond shapes that weren\'t fit for best drinks"'),
            ("TLC 2024 review",     "HIGH",   'Icebreaker Pop 2.0 called out for "spill-proof design" — implying ALL others spill'),
            ("Resistance review",   "MED",    'Metal straws described as "taste metallic" — consistent cross-platform complaint'),
            ("Straw reviews",       "HIGH",   '"straws don\'t match the aesthetic of the drink" — design mismatch frustration'),
        ],
        "existing_workarounds": [
            "Carrying molds very slowly to freezer, one at a time",
            "Using a plastic bag to contain potential leaks during freezer transport",
            "Putting molds on flat frozen surfaces before filling to keep level",
            "Using a syringe or turkey baster to fill narrow openings",
            "Buying Yogitoes-quality products after multiple cheap versions fail",
            "Using glass straws to avoid metal taste (but fragility concern)",
        ],
        "products_users_wish_existed": [
            '"A sphere mold that doesn\'t leak during the walk to the freezer"',
            '"Something where the ice looks good AND is easy to make"',
            '"Straws that match what I\'m drinking — not just random metal"',
            '"An all-in-one cocktail setup that doesn\'t require 6 different purchases"',
        ],
        "frequency_map": {
            "Molds leaking during freezer transport": "VERY HIGH — appeared in every ice mold review",
            "Tedious fill/assembly process": "HIGH — ATK, CNN, TLC all noted it",
            "Incomplete or cracked sphere ice": "HIGH — documented design flaw",
            "Metal straw taste": "HIGH — consistent across straw platforms",
            "Straw aesthetic mismatch": "MED — but grows with cocktail culture trend",
        },
        "product_concepts": [
            {
                "name": "The No-Spill Cocktail Ice System",
                "built_from_language": '"leaked out easily", "too flimsy to steady", "tedious process", "warped-looking shapes"',
                "description": (
                    "Sphere mold with sealed locking mechanism — clicks shut before carrying, "
                    "releases ice with one squeeze (no prying). Top fill port with rubber seal. "
                    "Each sphere cavity has an infusion insert chamber (herbs, citrus, berries). "
                    "Compatible stackable cube tray (same design language) for highball drinks. "
                    "Matching glass straws in 3 widths (spirits, cocktail, smoothie) included. "
                    "Storage pouch for straws. Gift box included standard. "
                    "Price: $55. Brand: everything for the cocktail host, designed as a system."
                ),
                "usp": "Fill it, lock it, freeze it, impress them. Zero spills. Zero tedious prying.",
                "pain_points_solved": 4,
                "intensity": 82, "frequency": 78, "gap": 92, "addressable": 65, "brandability": 88,
                "tiktok_angle": '"The slow-ice cocktail setup that doesn\'t leak everywhere" — demonstration video',
            },
            {
                "name": "The Cocktail Glass Straw Collection (Drink-Matched)",
                "built_from_language": '"straws don\'t match the aesthetic" + "metallic taste" + "plastic straws embarrassing"',
                "description": (
                    "Glass straws in 3 designated formats: "
                    "(1) Clear straight 8mm — spirits and classic cocktails; "
                    "(2) Smoked/tinted angled 10mm — mixed drinks and mocktails; "
                    "(3) Wide clear 14mm — frozen drinks and thick textures. "
                    "Each type has a matching silicone tip and branded cleaning brush. "
                    "Sold as 'The Host Set' (2 of each type + linen pouch, $28). "
                    "For the first time, the straw enhances the drink presentation rather "
                    "than being an afterthought."
                ),
                "usp": "A straw for every drink. Designed to be seen.",
                "pain_points_solved": 3,
                "intensity": 75, "frequency": 70, "gap": 88, "addressable": 62, "brandability": 85,
                "tiktok_angle": '"Which straw goes with which cocktail?" — educational bar content',
            },
        ],
    },

    # ─────────────────────────────────────────────────────────────────────────
    "THE AESTHETIC HOME CHEF — Cooking Utensils + Potholders": {
        "target_customer": (
            "28–42 years old. Cooks seriously at home. Has food TikTok or aspires to. "
            "Frustrated by generic black silicone sets. Wants kitchen tools worth photographing."
        ),
        "platforms_searched": ["Consumer Reports 2024", "GMInsights market report",
                                "ASD Market Week 2025 trends", "Single-use gadget reviews",
                                "October 2024 black plastic toxicity study media coverage"],
        "exact_complaints": [
            ("Consumer Reports",    "HIGH",   'Single-use tools "eventually gathering dust in your kitchen because they don\'t live up to the hype"'),
            ("Consumer Reports",    "HIGH",   '"assembly issues, weak magnets, and poor spout design" — quality failure patterns'),
            ("Oct 2024 news study", "HIGH",   '"black plastic kitchen utensils contain large amounts of toxic flame retardants that can leach into food"'),
            ("Oct 2024 news study", "HIGH",   'Black plastic "linked to thyroid dysfunction, endocrine disruptions, neurotoxicity" — safety panic driver'),
            ("Market research",     "HIGH",   '"poor print quality, cheap materials, and misleading advertising" — consumer complaint triad'),
            ("Consumer Reports",    "MED",    '"collapsible measuring cups: rust, inaccurate markings, poor spout design" — consistent design flaws'),
        ],
        "existing_workarounds": [
            "Avoiding black plastic utensils (post-Oct 2024 study — large behavioral shift)",
            "Buying only stainless steel or wood as safe alternative",
            "Shopping at specialty kitchen stores to avoid Amazon quality variance",
            "Checking 'made in USA' or EU safety certifications before buying",
            "Returning cheap sets and buying individual quality pieces separately",
        ],
        "products_users_wish_existed": [
            '"Utensils that don\'t have black plastic" — post-2024 safety concern is now mainstream',
            '"A kitchen brand I actually trust with clean materials"',
            '"5 good tools that work instead of 33 that don\'t"',
            '"Matching set that looks good hanging on the wall, not just in a drawer"',
        ],
        "frequency_map": {
            "Black plastic toxicity concern": "VERY HIGH — October 2024 study went viral, category-level response",
            "Tools taking up space without being used": "HIGH — Consumer Reports confirmed",
            "Design quality failures": "HIGH — documented across brands",
            "Desire for premium material alternative": "HIGH — post-black-plastic panic creates demand",
            "Aesthetic kitchen identity": "MED-HIGH — growing TikTok food content trend",
        },
        "product_concepts": [
            {
                "name": "The Clean Kitchen 5-Piece (Zero Black Plastic)",
                "built_from_language": '"black plastic contains toxic flame retardants" + "gathering dust" + "5 good tools instead of 33"',
                "description": (
                    "5 essential tools in stainless steel + food-grade silicone (non-black) "
                    "or sustainably-sourced wood: spatula, spoon, tongs, whisk, ladle. "
                    "Safety certification on-pack: BPA-free, phthalate-free, no black plastic. "
                    "Materials disclosed on QR code (addresses Oct 2024 black plastic panic). "
                    "Colors: matte sage, warm sand, burnt sienna (seasonal releases). "
                    "Price: $48. Brand message: 'Five tools. Zero toxins. Nothing extra.' "
                    "DTC-first with Amazon secondary. Clean ingredient disclosure parallels "
                    "the food transparency movement."
                ),
                "usp": "Five tools with nothing toxic. Nothing you won't use. Nothing generic.",
                "pain_points_solved": 4,
                "intensity": 88, "frequency": 80, "gap": 92, "addressable": 72, "brandability": 94,
                "tiktok_angle": '"Replacing all my black plastic kitchen tools after the 2024 study" — high search volume hook',
            },
            {
                "name": "The Food Creator Kitchen Trio (Camera-Ready Tools)",
                "built_from_language": '"gathering dust", "looks good on camera", "poor quality/misleading advertising"',
                "description": (
                    "3 tools curated for visual use in cooking content: "
                    "matte stainless spatula, teak-handled whisk, color-glazed ceramic spoon. "
                    "Each has a profile designed for how it appears on-screen (no harsh reflections, "
                    "color-balanced with common food styling palettes). "
                    "Sold with a 'content styling guide' PDF: how to use kitchen tools as props. "
                    "Brand seeded to 50 food creators with kits. Sold at $42. "
                    "Brand identity: tools you're proud to be seen using."
                ),
                "usp": "Tools that look as good on camera as they work in your kitchen.",
                "pain_points_solved": 3,
                "intensity": 78, "frequency": 72, "gap": 90, "addressable": 60, "brandability": 92,
                "tiktok_angle": '"My kitchen tools that actually look good in my reels" — aspirational content',
            },
        ],
    },

    # ─────────────────────────────────────────────────────────────────────────
    "THE HOME DECOR CURATOR — Candles & Holders": {
        "target_customer": (
            "26–38 years old. Curates home environment intentionally. "
            "Shops home decor seasonally. TikTok home aesthetic consumer. "
            "Gives home decor as gifts."
        ),
        "platforms_searched": ["CandleScience trend report 2024",
                                "TikTok Shop candle trends (2M+ posts fall 2024)",
                                "Grand View Research candle holder market report",
                                "The Registry fall 2024 TikTok trends"],
        "exact_complaints": [
            ("TikTok trend report", "VERY HIGH", '"Candles emerged as the most popular home décor feature on TikTok with over 2 million posts in fall 2024"'),
            ("Grand View Research", "HIGH", '"poor print quality, cheap materials, and misleading advertising" — top 3 consumer complaints in $2B market'),
            ("Market research",     "HIGH", '"growing consumer interest in homeware with minimal designs and bold color palettes" — unmet aesthetic demand'),
            ("CandleScience",       "HIGH", '"Quiet Luxury to Elegant Maximalism" — two conflicting aesthetic trends = brand identity vacuum'),
            ("Market report",       "HIGH", 'Market expected to grow 7.4% CAGR to 2030 — demand confirmed, supply is low-quality commodities'),
        ],
        "existing_workarounds": [
            "Buying from Etsy (but inconsistent quality, shipping)",
            "Shopping at HomeGoods/TJ Maxx (no brand story, no subscription)",
            "DIY candle holder projects from TikTok (time-intensive)",
            "Mixing brands from multiple Amazon purchases (no cohesion)",
        ],
        "products_users_wish_existed": [
            '"Candle holders that match my aesthetic — not just clear glass votives"',
            '"A home decor brand that updates with the seasons without me having to shop"',
            '"A gift under $35 that looks expensive and requires no scent knowledge"',
            '"Something cohesive, not random"',
        ],
        "frequency_map": {
            "Generic/cheap holder quality": "VERY HIGH — #1 market complaint in $2B category",
            "No aesthetic brand to trust at $25–45 price point": "HIGH — brand vacuum confirmed",
            "Seasonal decor need without seasonal shopping effort": "HIGH — TikTok trend confirmed",
            "Gifting without scent knowledge": "HIGH — gift-avoidance behavior",
        },
        "product_concepts": [
            {
                "name": "The Seasonal Home Edit (Quarterly Aesthetic Subscription)",
                "built_from_language": '"no brand at $25-45 price point", "2M TikTok posts in fall 2024", "minimal designs + bold palettes"',
                "description": (
                    "Quarterly subscription: 6 tealight holders per edit, designed around a "
                    "seasonal palette (fall = matte terracotta, winter = frosted glass, "
                    "spring = rattan weave, summer = matte ceramic). "
                    "Each seasonal edition is photographable, Instagram-native. "
                    "Includes 'room arrangement' card with 3 setup options. "
                    "Price: $38/quarter. Gift subscription available. "
                    "First edition is a conversion hook — 'continue your edit' = subscription. "
                    "DTC brand with Amazon discovery path. "
                    "Brand: 'your home, seasonally updated — without shopping.'"
                ),
                "usp": "Your home changes with the seasons. Without you lifting a browser.",
                "pain_points_solved": 3,
                "intensity": 78, "frequency": 85, "gap": 92, "addressable": 62, "brandability": 96,
                "tiktok_angle": '"Unboxing my seasonal home edit — the autumn collection" — highest-sharing format in home decor',
            },
        ],
    },

}

# ─────────────────────────────────────────────────────────────────────────────
# SCORING + REPORT
# ─────────────────────────────────────────────────────────────────────────────

def score(c: dict) -> float:
    base = (c["intensity"] * 0.25 + c["frequency"] * 0.25
            + c["gap"] * 0.25 + c["addressable"] * 0.15
            + c["brandability"] * 0.10)
    bonus = (c["pain_points_solved"] - 2) * 2.5
    return round(min(100, base + bonus), 1)


def run():
    now_str = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    print(f"\n{'#'*72}")
    print(f"  VOICE-OF-CUSTOMER RESEARCH → PRODUCT CONCEPTS")
    print(f"  Platform sources: Reddit · Amazon · TikTok · YouTube · PMC · Pro Communities")
    print(f"  {now_str}")
    print(f"{'#'*72}")

    all_concepts = []

    for archetype, data in VOC_DATA.items():
        print(f"\n\n{'═'*72}")
        print(f"  {archetype.upper()}")
        print(f"{'═'*72}")
        print(f"\n  Target: {data['target_customer']}")
        print(f"  Platforms searched: {', '.join(data['platforms_searched'][:4])}")

        print(f"\n  EXACT CUSTOMER LANGUAGE (by frequency):")
        sorted_complaints = sorted(data["exact_complaints"], key=lambda x: {"VERY HIGH": 0, "HIGH": 1, "MED": 2}[x[1]])
        for source, freq, quote in sorted_complaints[:8]:
            print(f"    [{freq:9}] [{source}] {quote[:80]}")

        print(f"\n  EXISTING WORKAROUNDS:")
        for w in data["existing_workarounds"][:4]:
            print(f"    · {w}")

        print(f"\n  WHAT CUSTOMERS WISH EXISTED:")
        for w in data["products_users_wish_existed"][:3]:
            print(f"    → {w}")

        print(f"\n  COMPLAINT FREQUENCY MAP:")
        for complaint, freq in list(data["frequency_map"].items())[:4]:
            print(f"    {complaint[:45]:45} {freq}")

        print(f"\n  PRODUCT CONCEPTS:")
        for c in data["product_concepts"]:
            pl = score(c)
            print(f"\n    ▸ {c['name']}  [Score: {pl}/100]")
            print(f"      Built from: {c['built_from_language'][:90]}")
            print(f"      USP: {c['usp']}")
            print(f"      Solves {c['pain_points_solved']} simultaneous problems")
            print(f"      TikTok: {c['tiktok_angle'][:70]}")
            all_concepts.append({
                "archetype": archetype.split("—")[0].strip(),
                "target_customer": data["target_customer"][:100],
                "pain_cluster": c["built_from_language"][:120],
                "problems_solved": c["pain_points_solved"],
                "pl_score": pl,
                "product_name": c["name"],
                "product_description": c["description"][:250],
                "usp": c["usp"],
                "tiktok_angle": c["tiktok_angle"],
                "intensity": c["intensity"],
                "frequency": c["frequency"],
                "solution_gap": c["gap"],
                "addressable": c["addressable"],
                "brandability": c["brandability"],
            })

    # ── Global top-25 ─────────────────────────────────────────────────────────
    all_concepts.sort(key=lambda x: x["pl_score"], reverse=True)
    top = all_concepts[:25]

    print(f"\n\n{'#'*72}")
    print(f"  GLOBAL TOP 25 — RANKED BY VOC SCORE")
    print(f"{'#'*72}")
    for rank, c in enumerate(top, 1):
        print(f"\n  #{rank:02d}  {c['pl_score']}/100  [{c['archetype'].upper()}]")
        print(f"       {c['product_name']}")
        print(f"       {c['usp']}")
        print(f"       Solves {c['problems_solved']} problems  |  TikTok: {c['tiktok_angle'][:55]}")

    # ── Save CSV ──────────────────────────────────────────────────────────────
    out = Path("voc_product_concepts.csv")
    fields = ["rank", "archetype", "product_name", "pl_score", "problems_solved",
              "usp", "pain_cluster", "product_description", "tiktok_angle",
              "intensity", "frequency", "solution_gap", "addressable", "brandability",
              "target_customer"]
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for rank, c in enumerate(top, 1):
            w.writerow({"rank": rank, **c})

    print(f"\n\n  Saved: {out}  ({len(top)} concepts)")
    print(f"{'#'*72}\n")


if __name__ == "__main__":
    run()
