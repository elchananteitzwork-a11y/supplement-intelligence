---
name: Product Intelligence Narrative
colors:
  surface: '#f9f9f9'
  surface-dim: '#dadada'
  surface-bright: '#f9f9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f3'
  surface-container: '#eeeeee'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e2e2e2'
  on-surface: '#1a1c1c'
  on-surface-variant: '#4c4546'
  inverse-surface: '#2f3131'
  inverse-on-surface: '#f1f1f1'
  outline: '#7e7576'
  outline-variant: '#cfc4c5'
  surface-tint: '#5e5e5e'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1b1b1b'
  on-primary-container: '#848484'
  inverse-primary: '#c6c6c6'
  secondary: '#5d5f5f'
  on-secondary: '#ffffff'
  secondary-container: '#dfe0e0'
  on-secondary-container: '#616363'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#1b1c1c'
  on-tertiary-container: '#848484'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2e2e2'
  primary-fixed-dim: '#c6c6c6'
  on-primary-fixed: '#1b1b1b'
  on-primary-fixed-variant: '#474747'
  secondary-fixed: '#e2e2e2'
  secondary-fixed-dim: '#c6c6c7'
  on-secondary-fixed: '#1a1c1c'
  on-secondary-fixed-variant: '#454747'
  tertiary-fixed: '#e4e2e2'
  tertiary-fixed-dim: '#c7c6c6'
  on-tertiary-fixed: '#1b1c1c'
  on-tertiary-fixed-variant: '#464747'
  background: '#f9f9f9'
  on-background: '#1a1c1c'
  surface-variant: '#e2e2e2'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 56px
    fontWeight: '800'
    lineHeight: 64px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '800'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-mono:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
  verdict-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '900'
    lineHeight: 12px
spacing:
  grid-unit: 8px
  container-padding: 40px
  gutter: 24px
  element-gap: 16px
  section-gap: 64px
---

## Brand & Style

This design system is built on the principles of **Neo-Brutalism** and **Minimalism**. It is engineered for a high-stakes "Product Intelligence" environment where the speed of insight and the defensibility of data are paramount. The aesthetic rejects decorative flourishes, gradients, and illustrations in favor of structural clarity and raw functionality.

The target audience consists of product leaders and analysts who require a high-density, low-friction interface. The emotional response is one of authority, precision, and objectivity. Every pixel must serve a functional purpose; if a visual element does not convey data or hierarchy, it is removed.

**Core Principles:**
- **Data over Decoration:** No emojis, icons are strictly functional, and whitespace is used to group data logically rather than for "breathability."
- **High-Contrast Precision:** Heavy use of black and white creates an unmistakable visual hierarchy.
- **Structural Integrity:** Heavy borders and monospaced-adjacent layouts emphasize a "built" rather than "designed" feel.

## Colors

The palette is strictly monochrome to ensure that the user's attention is never diverted from the content. Saturated colors are reserved exclusively for "Verdict" statuses, acting as the only chromatic signals in the interface.

- **Primary & Neutral:** The interface relies on `#000000` (Black) for text and structural elements, and `#FFFFFF` (White) for the base surface. Various shades of gray are used for borders and secondary labels.
- **Semantic Colors:** 
  - `BUILD_NOW`: High-saturation Green. Used for positive verdicts.
  - `AVOID`: High-saturation Red. Used for critical warnings or negative verdicts.
  - `MONITOR`: High-saturation Yellow. Used for cautionary states.
- **Backgrounds:** Use pure white for cards and pure black for primary action triggers.

## Typography

Typography is the primary tool for expressing hierarchy. We use **Inter** for its systematic neutrality and high legibility. 

- **Headlines:** The 56px bold headline is the anchor of the page. It must be used sparingly to define major sections.
- **Labels:** For metadata and evidence tracking, we introduce a monospaced font (**JetBrains Mono**) to evoke a sense of technical precision and data integrity.
- **Verdicts:** All verdict-related text must be uppercase with a heavy font weight to ensure immediate recognition.

## Layout & Spacing

The layout follows a **Fixed Grid** philosophy for desktop to maintain a "dashboard" or "terminal" feel, switching to a fluid model for mobile.

- **Grid:** Use a 12-column grid with 24px gutters. Elements should snap to the 8px base unit.
- **Density:** Information density should be high. Use 16px padding for standard cards and 40px for global container margins.
- **Alignment:** All data points must be top-left aligned. Avoid centered layouts, which detract from the tool-like nature of the interface.

## Elevation & Depth

This design system rejects the concept of "z-space" through shadows. Depth is achieved via **Bold Borders** and **Tonal Layers**.

- **Borders:** Surfaces are defined by 1px or 2px solid black borders. 
- **Shadow Exception:** A single, subtle, non-diffused "hard shadow" (2px offset, 0px blur, black) is permitted only for the primary search input to denote it as the "active engine" of the tool.
- **Layering:** Use `#F2F2F2` (Light Gray) for the background of the page and `#FFFFFF` (White) for the cards sitting on top.

## Shapes

The shape language is strictly **Sharp (0px roundedness)**. 

Every element—buttons, cards, input fields, and tags—must have 90-degree corners. This reinforces the brutalist aesthetic and the concept of "unfiltered" data. The only exception to this rule is the "Witness Dot" component, which utilizes circles to represent discrete points of evidence.

## Components

- **Primary Button:** Solid black background, white text, uppercase, bold. No rounded corners. On hover, the color inverts (white background, black text, black border).
- **Secondary Button:** White background, 1px black border, black text. Subtle and structural.
- **Cards:** White background, 1px `#000000` border. No shadow. Padding is consistent at 24px.
- **Witness Dots:** Small 8px circles. 
  - *Filled:* Evidence exists/verified.
  - *Hollow (1px border):* Evidence missing/required.
- **Input Fields:** White background, 2px black border. The search input features a 2px offset hard shadow.
- **Verdict Badges:** Solid background blocks using the semantic palette (Green/Red/Yellow) with black or white text depending on contrast requirements.
- **Data Tables:** No vertical lines. Horizontal lines should be 1px `#E0E0E0`. Header row must be in `label-mono` style with a light gray background.
