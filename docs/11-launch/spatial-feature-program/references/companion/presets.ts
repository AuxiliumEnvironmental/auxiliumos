/**
 * Built-in assessment presets (water, mold, fire/smoke, demolition, general), default
 * legend entries, symbol library definitions and the moisture scale/unit vocabulary.
 * Presets are product decisions; company admins can extend them through versioned
 * legend/form definitions.
 */
import type { LegendEntry } from "./schemas";
import { legacyLegendEntries } from "./legacy";

export type Domain = "water" | "mold" | "fire" | "demolition" | "general";
export const DOMAINS: readonly { id: Domain; label: string; accent: string }[] = [
  { id: "water", label: "Water / moisture", accent: "#2f6fd6" },
  { id: "mold", label: "Mold / microbial", accent: "#2f7d63" },
  { id: "fire", label: "Fire / smoke / soot", accent: "#5b5b5b" },
  { id: "demolition", label: "Demolition / action", accent: "#e0362f" },
  { id: "general", label: "General condition", accent: "#7d3fd6" },
];

export interface ConditionPreset {
  domain: Domain;
  condition: string;
  label: string;
  legendToken: string;
  evidenceTypes: string[];
}

export const CONDITION_PRESETS: readonly ConditionPreset[] = [
  { domain: "water", condition: "elevated_moisture", label: "Elevated comparative moisture", legendToken: "water.elevated", evidenceTypes: ["meter", "visual", "thermal"] },
  { domain: "water", condition: "visible_staining", label: "Visible staining", legendToken: "water.staining", evidenceTypes: ["visual", "photo"] },
  { domain: "water", condition: "wet_material", label: "Wet material", legendToken: "water.wet", evidenceTypes: ["meter", "visual"] },
  { domain: "water", condition: "moisture_extent", label: "Moisture extent boundary", legendToken: "water.extent", evidenceTypes: ["meter", "thermal"] },
  { domain: "water", condition: "migration_indicator", label: "Migration indicator (assessor-entered)", legendToken: "water.migration", evidenceTypes: ["visual"] },
  { domain: "mold", condition: "visible_growth_like", label: "Visible growth-like material (controlled term)", legendToken: "mold.visible", evidenceTypes: ["visual", "photo", "sample"] },
  { domain: "mold", condition: "moisture_evidence", label: "Moisture evidence supporting assessment", legendToken: "mold.moisture", evidenceTypes: ["meter", "visual"] },
  { domain: "mold", condition: "sample_location", label: "Sample location", legendToken: "samples.location", evidenceTypes: ["sample"] },
  { domain: "mold", condition: "comparison_location", label: "Comparison / outdoor / control location", legendToken: "samples.comparison", evidenceTypes: ["sample"] },
  { domain: "mold", condition: "inaccessible", label: "Inaccessible area / scope limitation", legendToken: "info.limitation", evidenceTypes: ["visual"] },
  { domain: "fire", condition: "soot_deposition", label: "Soot / particulate deposition (observed)", legendToken: "fire.soot", evidenceTypes: ["visual", "photo", "sample"] },
  { domain: "fire", condition: "char", label: "Char", legendToken: "fire.char", evidenceTypes: ["visual", "photo"] },
  { domain: "fire", condition: "heat_damage", label: "Heat damage", legendToken: "fire.heat", evidenceTypes: ["visual", "photo"] },
  { domain: "fire", condition: "odor", label: "Odor (observed)", legendToken: "fire.odor", evidenceTypes: ["olfactory"] },
  { domain: "fire", condition: "direction_hypothesis", label: "Direction indicator (hypothesis)", legendToken: "fire.direction", evidenceTypes: ["visual"] },
  { domain: "demolition", condition: "proposed_removal", label: "Proposed removal scope", legendToken: "actions.demo", evidenceTypes: ["assessment"] },
  { domain: "general", condition: "crack", label: "Crack", legendToken: "general.crack", evidenceTypes: ["visual", "photo"] },
  { domain: "general", condition: "impact_damage", label: "Impact damage", legendToken: "general.impact", evidenceTypes: ["visual", "photo"] },
  { domain: "general", condition: "corrosion", label: "Corrosion", legendToken: "general.corrosion", evidenceTypes: ["visual", "photo"] },
  { domain: "general", condition: "water_intrusion", label: "Water intrusion path", legendToken: "general.intrusion", evidenceTypes: ["visual"] },
  { domain: "general", condition: "envelope_defect", label: "Envelope defect", legendToken: "general.envelope", evidenceTypes: ["visual", "photo"] },
  { domain: "general", condition: "hazard", label: "Hazard / access limitation", legendToken: "info.limitation", evidenceTypes: ["visual"] },
];

export const ACTION_TYPES: readonly { id: string; label: string; domain: Domain | "any" }[] = [
  { id: "dry", label: "Dry", domain: "water" },
  { id: "demo", label: "Demo / remove", domain: "demolition" },
  { id: "clean", label: "Clean", domain: "any" },
  { id: "remediate", label: "Remediate", domain: "mold" },
  { id: "hepa_vacuum", label: "HEPA vacuum", domain: "any" },
  { id: "seal", label: "Seal / encapsulate", domain: "fire" },
  { id: "test", label: "Test / sample", domain: "any" },
  { id: "monitor", label: "Monitor", domain: "water" },
  { id: "contain", label: "Containment", domain: "mold" },
  { id: "further_evaluation", label: "Further evaluation", domain: "any" },
];

export const SURFACE_COMPONENTS: readonly string[] = [
  "floor", "subfloor", "wall", "wall_lower", "wall_upper", "ceiling", "base_trim", "casing", "door", "window_sill", "cabinet", "toe_kick", "countertop",
  "insulation", "framing", "sheathing", "duct", "contents", "other",
];

export const MOISTURE_SCALES: readonly { id: string; label: string; unit: string; description: string }[] = [
  { id: "pct_mc_wood", label: "%MC (wood scale)", unit: "%MC", description: "Percent moisture content on the instrument wood scale." },
  { id: "pct_wme", label: "%WME", unit: "%WME", description: "Wood moisture equivalent; not a material percentage for non-wood materials." },
  { id: "relative_pinless", label: "Relative (pinless)", unit: "relative", description: "Instrument-specific relative scale. Not comparable across instruments." },
  { id: "relative_search", label: "Relative (search mode)", unit: "relative", description: "Instrument-specific relative search scale." },
  { id: "pct_gypsum", label: "% (gypsum scale)", unit: "%MC", description: "Instrument gypsum scale percent." },
  { id: "other", label: "Other / raw", unit: "other", description: "Preserve raw notation; requires review." },
];
export const READING_MODES = ["pin", "pinless", "surface", "other"] as const;
export const HEIGHT_UNITS = ["in", "ft", "mm", "cm", "m"] as const;
export const HEIGHT_REFERENCES = ["above_floor", "below_ceiling", "floor", "ceiling", "unknown"] as const;
export const ASSEMBLY_CONTEXTS = ["unspecified", "exposed_face", "through_finish", "behind_base", "cavity", "subfloor", "exterior"] as const;

export const SAMPLE_MEDIA: readonly { id: string; label: string; needsVolume: boolean; needsIntakeHeight: boolean }[] = [
  { id: "tape", label: "Tape lift", needsVolume: false, needsIntakeHeight: false },
  { id: "swab", label: "Swab", needsVolume: false, needsIntakeHeight: false },
  { id: "air", label: "Air (spore trap)", needsVolume: true, needsIntakeHeight: true },
  { id: "air_culturable", label: "Air (culturable)", needsVolume: true, needsIntakeHeight: true },
  { id: "material", label: "Bulk material", needsVolume: false, needsIntakeHeight: false },
  { id: "wipe", label: "Wipe (surface)", needsVolume: false, needsIntakeHeight: false },
  { id: "dust", label: "Settled dust", needsVolume: false, needsIntakeHeight: false },
  { id: "asbestos_bulk", label: "Asbestos bulk (typed extension)", needsVolume: false, needsIntakeHeight: false },
  { id: "lead_paint_chip", label: "Lead paint chip (typed extension)", needsVolume: false, needsIntakeHeight: false },
];
export const SAMPLE_CLASSIFICATIONS = ["indoor", "outdoor", "comparison", "control", "field_blank", "duplicate"] as const;
export const SAMPLE_STATUSES = ["planned", "collected", "submitted", "received", "resulted", "reviewed", "voided"] as const;

export function defaultLegendEntries(): LegendEntry[] {
  const modern: LegendEntry[] = [
    { token: "water.elevated", label: "Elevated comparative moisture", group: "Water", color: "#2f6fd6", pattern: "solid", lineStyle: "solid", symbol: null, domain: "water", explanatory: false, sortOrder: 0 },
    { token: "water.staining", label: "Visible staining", group: "Water", color: "#9fd8f0", pattern: "diagonal", lineStyle: "solid", symbol: null, domain: "water", explanatory: false, sortOrder: 1 },
    { token: "water.wet", label: "Wet material", group: "Water", color: "#1b4fa8", pattern: "solid", lineStyle: "solid", symbol: null, domain: "water", explanatory: false, sortOrder: 2 },
    { token: "water.extent", label: "Moisture extent boundary", group: "Water", color: "#2f6fd6", pattern: "none", lineStyle: "dashed", symbol: null, domain: "water", explanatory: false, sortOrder: 3 },
    { token: "water.migration", label: "Migration indicator (assessor-entered)", group: "Water", color: "#2f6fd6", pattern: "none", lineStyle: "dotted", symbol: "arrow", domain: "water", explanatory: false, sortOrder: 4 },
    { token: "mold.visible", label: "Visible growth-like material", group: "Mold", color: "#2f7d63", pattern: "crosshatch", lineStyle: "solid", symbol: null, domain: "mold", explanatory: false, sortOrder: 10 },
    { token: "mold.moisture", label: "Moisture evidence", group: "Mold", color: "#7fbfa5", pattern: "diagonal", lineStyle: "solid", symbol: null, domain: "mold", explanatory: false, sortOrder: 11 },
    { token: "fire.soot", label: "Soot / particulate deposition", group: "Fire", color: "#3a3a3a", pattern: "dots", lineStyle: "solid", symbol: null, domain: "fire", explanatory: false, sortOrder: 20 },
    { token: "fire.char", label: "Char", group: "Fire", color: "#111111", pattern: "solid", lineStyle: "solid", symbol: null, domain: "fire", explanatory: false, sortOrder: 21 },
    { token: "fire.heat", label: "Heat damage", group: "Fire", color: "#b3541e", pattern: "hatch", lineStyle: "solid", symbol: null, domain: "fire", explanatory: false, sortOrder: 22 },
    { token: "fire.odor", label: "Odor (observed)", group: "Fire", color: "#8c8c8c", pattern: "none", lineStyle: "dotted", symbol: null, domain: "fire", explanatory: false, sortOrder: 23 },
    { token: "fire.direction", label: "Direction indicator (hypothesis)", group: "Fire", color: "#5b5b5b", pattern: "none", lineStyle: "dashed", symbol: "arrow", domain: "fire", explanatory: false, sortOrder: 24 },
    { token: "actions.demo", label: "Proposed removal", group: "Actions", color: "#e0362f", pattern: "hatch", lineStyle: "solid", symbol: null, domain: "actions", explanatory: false, sortOrder: 30 },
    { token: "actions.dry", label: "Dry in place", group: "Actions", color: "#f0b429", pattern: "dots", lineStyle: "solid", symbol: null, domain: "actions", explanatory: false, sortOrder: 31 },
    { token: "actions.clean", label: "Clean", group: "Actions", color: "#22b34a", pattern: "diagonal", lineStyle: "solid", symbol: null, domain: "actions", explanatory: false, sortOrder: 32 },
    { token: "actions.remediate", label: "Remediate", group: "Actions", color: "#7d3fd6", pattern: "crosshatch", lineStyle: "solid", symbol: null, domain: "actions", explanatory: false, sortOrder: 33 },
    { token: "samples.location", label: "Sample location", group: "Samples", color: "#f06ecf", pattern: "solid", lineStyle: "solid", symbol: "sample", domain: "samples", explanatory: false, sortOrder: 40 },
    { token: "samples.comparison", label: "Comparison / control location", group: "Samples", color: "#7fd3f5", pattern: "solid", lineStyle: "solid", symbol: "sample", domain: "samples", explanatory: false, sortOrder: 41 },
    { token: "general.crack", label: "Crack", group: "General", color: "#7d3fd6", pattern: "none", lineStyle: "solid", symbol: null, domain: "general", explanatory: false, sortOrder: 50 },
    { token: "general.impact", label: "Impact damage", group: "General", color: "#b3541e", pattern: "hatch", lineStyle: "solid", symbol: null, domain: "general", explanatory: false, sortOrder: 51 },
    { token: "general.corrosion", label: "Corrosion", group: "General", color: "#8a5a2b", pattern: "dots", lineStyle: "solid", symbol: null, domain: "general", explanatory: false, sortOrder: 52 },
    { token: "general.intrusion", label: "Water intrusion path", group: "General", color: "#2f6fd6", pattern: "none", lineStyle: "dashed", symbol: "arrow", domain: "general", explanatory: false, sortOrder: 53 },
    { token: "general.envelope", label: "Envelope defect", group: "General", color: "#5b5b5b", pattern: "diagonal", lineStyle: "solid", symbol: null, domain: "general", explanatory: false, sortOrder: 54 },
    { token: "info.limitation", label: "Inaccessible / limitation", group: "Info", color: "#9ca3af", pattern: "crosshatch", lineStyle: "dashed", symbol: null, domain: "info", explanatory: false, sortOrder: 60 },
    { token: "info.equipment", label: "Drying / air equipment", group: "Info", color: "#0f766e", pattern: "solid", lineStyle: "solid", symbol: "equipment", domain: "info", explanatory: false, sortOrder: 61 },
    { token: "info.moisture_point", label: "Moisture reading location", group: "Info", color: "#1f2933", pattern: "solid", lineStyle: "solid", symbol: "pin", domain: "info", explanatory: false, sortOrder: 62 },
    { token: "info.photo", label: "Photo location / direction", group: "Info", color: "#6b7280", pattern: "solid", lineStyle: "solid", symbol: "camera", domain: "info", explanatory: false, sortOrder: 63 },
  ];
  return [...modern, ...legacyLegendEntries()];
}

/** Semantic legend presets managers can pick for a release. */
export const LEGEND_PROFILES: readonly { id: string; label: string; domains: readonly string[] }[] = [
  { id: "water", label: "Water / moisture", domains: ["water", "info"] },
  { id: "mold", label: "Mold / microbial", domains: ["mold", "samples", "info"] },
  { id: "fire", label: "Fire / smoke", domains: ["fire", "samples", "info"] },
  { id: "samples", label: "Sample-only", domains: ["samples", "info"] },
  { id: "actions", label: "Action-only", domains: ["actions", "info"] },
  { id: "legacy", label: "Legacy affected-material key", domains: ["water", "info"] },
  { id: "all", label: "All included items", domains: ["water", "mold", "fire", "demolition", "general", "samples", "actions", "info"] },
];

/** Architectural symbol library: simple original vector symbols in a 100×100 unit box. */
export interface SymbolDefinition {
  id: string;
  label: string;
  category: "opening" | "fixture" | "equipment" | "annotation" | "structure";
  hostedOnWall: boolean;
  defaultWidth: number;
  defaultHeight: number;
  /** Simple path commands in a 0..100 box: M x y, L x y, A (arc: cx cy r startDeg endDeg), C (circle: cx cy r), R (rect x y w h), Z */
  paths: string[];
  filled?: boolean;
}

export const SYMBOL_LIBRARY: readonly SymbolDefinition[] = [
  { id: "door_single", label: "Single swing door", category: "opening", hostedOnWall: true, defaultWidth: 36, defaultHeight: 36, paths: ["M 0 0 L 0 100", "A 0 0 100 -90 0"] },
  { id: "door_double", label: "Double swing door", category: "opening", hostedOnWall: true, defaultWidth: 72, defaultHeight: 36, paths: ["M 0 0 L 0 50", "A 0 0 50 -90 0", "M 100 0 L 100 50", "A 100 0 50 180 270"] },
  { id: "door_sliding", label: "Sliding door", category: "opening", hostedOnWall: true, defaultWidth: 72, defaultHeight: 8, paths: ["R 0 30 55 20", "R 45 50 55 20"] },
  { id: "door_pocket", label: "Pocket door", category: "opening", hostedOnWall: true, defaultWidth: 36, defaultHeight: 8, paths: ["R 40 35 60 30", "M 0 50 L 40 50"] },
  { id: "door_bifold", label: "Bifold door", category: "opening", hostedOnWall: true, defaultWidth: 48, defaultHeight: 24, paths: ["M 0 0 L 25 100 L 50 0 L 75 100 L 100 0"] },
  { id: "doorway_open", label: "Open doorway", category: "opening", hostedOnWall: true, defaultWidth: 36, defaultHeight: 6, paths: ["M 0 40 L 0 60", "M 100 40 L 100 60"] },
  { id: "window", label: "Window", category: "opening", hostedOnWall: true, defaultWidth: 36, defaultHeight: 6, paths: ["R 0 30 100 40", "M 0 50 L 100 50"] },
  { id: "stairs", label: "Stairs", category: "structure", hostedOnWall: false, defaultWidth: 36, defaultHeight: 96, paths: ["R 0 0 100 100", "M 0 20 L 100 20", "M 0 40 L 100 40", "M 0 60 L 100 60", "M 0 80 L 100 80", "M 50 100 L 50 0", "M 40 12 L 50 0 L 60 12"] },
  { id: "arrow_up", label: "Up arrow", category: "annotation", hostedOnWall: false, defaultWidth: 24, defaultHeight: 48, paths: ["M 50 100 L 50 0", "M 20 30 L 50 0 L 80 30"] },
  { id: "arrow_down", label: "Down arrow", category: "annotation", hostedOnWall: false, defaultWidth: 24, defaultHeight: 48, paths: ["M 50 0 L 50 100", "M 20 70 L 50 100 L 80 70"] },
  { id: "column", label: "Column", category: "structure", hostedOnWall: false, defaultWidth: 12, defaultHeight: 12, paths: ["R 0 0 100 100", "M 0 0 L 100 100", "M 100 0 L 0 100"], filled: true },
  { id: "cabinet", label: "Cabinet / counter", category: "fixture", hostedOnWall: false, defaultWidth: 36, defaultHeight: 24, paths: ["R 0 0 100 100", "M 0 15 L 100 15"] },
  { id: "tub", label: "Tub", category: "fixture", hostedOnWall: false, defaultWidth: 60, defaultHeight: 30, paths: ["R 0 0 100 100", "R 12 20 76 60", "C 20 50 5"] },
  { id: "shower", label: "Shower", category: "fixture", hostedOnWall: false, defaultWidth: 36, defaultHeight: 36, paths: ["R 0 0 100 100", "C 50 50 6", "M 0 0 L 100 100", "M 100 0 L 0 100"] },
  { id: "toilet", label: "Toilet", category: "fixture", hostedOnWall: false, defaultWidth: 20, defaultHeight: 28, paths: ["R 20 0 60 30", "A 50 62 32 0 360"] },
  { id: "sink", label: "Sink", category: "fixture", hostedOnWall: false, defaultWidth: 20, defaultHeight: 18, paths: ["R 0 0 100 100", "A 50 55 30 0 360", "C 50 15 4"] },
  { id: "appliance", label: "Appliance", category: "fixture", hostedOnWall: false, defaultWidth: 30, defaultHeight: 30, paths: ["R 0 0 100 100", "C 30 30 8", "C 70 30 8", "C 30 70 8", "C 70 70 8"] },
  { id: "water_source", label: "Water source", category: "annotation", hostedOnWall: false, defaultWidth: 16, defaultHeight: 16, paths: ["M 50 0 L 85 60 A 50 65 35 0 180 L 15 60 Z"], filled: true },
  { id: "electrical_panel", label: "Electrical panel", category: "fixture", hostedOnWall: false, defaultWidth: 16, defaultHeight: 24, paths: ["R 0 0 100 100", "M 55 10 L 35 55 L 60 55 L 45 90"] },
  { id: "hvac_supply", label: "HVAC supply", category: "fixture", hostedOnWall: false, defaultWidth: 16, defaultHeight: 8, paths: ["R 0 0 100 100", "M 0 0 L 100 100", "M 100 0 L 0 100", "M 50 50 L 50 0"] },
  { id: "hvac_return", label: "HVAC return", category: "fixture", hostedOnWall: false, defaultWidth: 16, defaultHeight: 8, paths: ["R 0 0 100 100", "M 0 0 L 100 100", "M 100 0 L 0 100"] },
  { id: "drain", label: "Drain", category: "fixture", hostedOnWall: false, defaultWidth: 10, defaultHeight: 10, paths: ["A 50 50 45 0 360", "M 20 50 L 80 50", "M 50 20 L 50 80"] },
  { id: "equipment", label: "Equipment (generic)", category: "equipment", hostedOnWall: false, defaultWidth: 20, defaultHeight: 20, paths: ["R 0 0 100 100", "M 20 80 L 50 20 L 80 80 Z"] },
  { id: "dehumidifier", label: "Dehumidifier", category: "equipment", hostedOnWall: false, defaultWidth: 24, defaultHeight: 24, paths: ["R 0 0 100 100", "M 15 20 L 85 20 L 85 40 L 15 40 Z", "M 50 90 L 50 60"] },
  { id: "air_mover", label: "Air mover", category: "equipment", hostedOnWall: false, defaultWidth: 18, defaultHeight: 18, paths: ["A 50 50 45 0 360", "M 50 50 L 95 50", "M 50 50 L 27 89", "M 50 50 L 27 11"] },
  { id: "air_scrubber", label: "Air scrubber", category: "equipment", hostedOnWall: false, defaultWidth: 24, defaultHeight: 24, paths: ["R 0 0 100 100", "A 50 50 30 0 360", "C 50 50 6"] },
  { id: "heater", label: "Heater", category: "equipment", hostedOnWall: false, defaultWidth: 24, defaultHeight: 24, paths: ["R 0 0 100 100", "M 18 68 L 34 32 L 50 68 L 66 32 L 82 68"] },
  { id: "containment", label: "Containment", category: "equipment", hostedOnWall: false, defaultWidth: 30, defaultHeight: 18, paths: ["R 0 0 100 100", "M 15 0 L 15 100", "M 85 0 L 85 100", "M 50 0 L 50 100"] },
  { id: "north_arrow", label: "North arrow", category: "annotation", hostedOnWall: false, defaultWidth: 30, defaultHeight: 50, paths: ["M 50 0 L 75 100 L 50 80 L 25 100 Z", "M 35 25 L 35 5 L 65 25 L 65 5"], filled: true },
  { id: "camera", label: "Photo direction", category: "annotation", hostedOnWall: false, defaultWidth: 16, defaultHeight: 16, paths: ["R 10 30 80 55", "A 50 57 18 0 360", "R 35 20 30 12"] },
  { id: "sample", label: "Sample marker", category: "annotation", hostedOnWall: false, defaultWidth: 14, defaultHeight: 14, paths: ["M 50 0 L 100 50 L 50 100 L 0 50 Z"], filled: true },
  { id: "pin", label: "Point marker", category: "annotation", hostedOnWall: false, defaultWidth: 12, defaultHeight: 12, paths: ["A 50 50 45 0 360", "C 50 50 8"] },
];

export function symbolById(id: string): SymbolDefinition | undefined {
  return SYMBOL_LIBRARY.find((s) => s.id === id);
}

/** Quick-add default presets per record kind. */
export const QUICK_ADD_PRIMARY: readonly ("moisture" | "sample" | "observation" | "photo")[] = ["moisture", "sample", "observation", "photo"];
