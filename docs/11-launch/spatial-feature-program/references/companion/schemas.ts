/**
 * Runtime validation (Zod) for every JSON column and for the mutation protocol.
 * These schemas run at the API boundary (server functions), at import boundaries and
 * before anything is written to the offline outbox.
 */
import { z } from "zod";
import type { JsonObject } from "./entities";

export const finite = z.number().finite();
export const pointSchema = z.object({ x: finite, y: finite });
export type Pt = z.infer<typeof pointSchema>;
export const pointsSchema = z.array(pointSchema).min(2).max(20000);
export const matrixSchema = z.tuple([finite, finite, finite, finite, finite, finite]);

const hexColor = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, "Expected a hex color");
export const colorSchema = hexColor.or(z.string().regex(/^rgba?\((\s*\d{1,3}\s*,){2}\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/));

export const styleSchema = z
  .object({
    stroke: colorSchema.nullable().default("#1f2933"),
    strokeWidth: z.number().min(0).max(200).default(2),
    fill: colorSchema.nullable().default(null),
    opacity: z.number().min(0).max(1).default(1),
    dash: z.array(z.number().min(0).max(200)).max(8).nullable().default(null),
    lineCap: z.enum(["butt", "round", "square"]).default("round"),
    lineJoin: z.enum(["miter", "round", "bevel"]).default("round"),
    fontSize: z.number().min(4).max(400).default(14),
    fontWeight: z.enum(["normal", "bold"]).default("normal"),
    textAlign: z.enum(["left", "center", "right"]).default("left"),
    textBackground: colorSchema.nullable().default(null),
    fillPattern: z.enum(["none", "hatch", "crosshatch", "dots", "diagonal"]).default("none"),
    blendMode: z.enum(["normal", "multiply"]).default("normal"),
    arrowStart: z.boolean().default(false),
    arrowEnd: z.boolean().default(true),
  })
  .strict();
export type Style = z.infer<typeof styleSchema>;
export const DEFAULT_STYLE: Style = styleSchema.parse({});

export const maskSchema = z.object({
  id: z.string().uuid(),
  type: z.literal("polygon"),
  points: z.array(pointSchema).min(3).max(5000),
  label: z.string().max(200).default("Mask"),
});
export type Mask = z.infer<typeof maskSchema>;
export const masksSchema = z.array(maskSchema).max(200);

export const provenanceSchema = z.enum(["measured", "entered", "graphical", "calibrated", "unknown"]);
export type Provenance = z.infer<typeof provenanceSchema>;

export const dimensionValueSchema = z.object({
  value: z.number().finite().nonnegative(),
  unit: z.enum(["in", "ft", "mm", "cm", "m"]),
  provenance: provenanceSchema,
});

export const geometrySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("line"), a: pointSchema, b: pointSchema }),
  z.object({ type: z.literal("polyline"), points: pointsSchema }),
  z.object({ type: z.literal("polygon"), points: z.array(pointSchema).min(3).max(20000) }),
  z.object({
    type: z.literal("rect"),
    x: finite,
    y: finite,
    width: finite.nonnegative(),
    height: finite.nonnegative(),
    rotation: finite.default(0),
    cornerRadius: finite.nonnegative().default(0),
  }),
  z.object({ type: z.literal("ellipse"), cx: finite, cy: finite, rx: finite.nonnegative(), ry: finite.nonnegative(), rotation: finite.default(0) }),
  z.object({ type: z.literal("arrow"), a: pointSchema, b: pointSchema, headSize: finite.positive().default(12) }),
  z.object({
    type: z.literal("text"),
    x: finite,
    y: finite,
    width: finite.positive().nullable().default(null),
    rotation: finite.default(0),
    text: z.string().max(5000),
  }),
  z.object({
    type: z.literal("callout"),
    anchor: pointSchema,
    box: z.object({ x: finite, y: finite, width: finite.positive(), height: finite.positive() }),
    text: z.string().max(5000),
  }),
  z.object({
    type: z.literal("stroke"),
    points: pointsSchema,
    pressures: z.array(z.number().min(0).max(1)).max(20000).nullable().default(null),
    rawPoints: z.array(pointSchema).max(20000).nullable().default(null),
  }),
  z.object({
    type: z.literal("symbol"),
    symbolId: z.string().min(1).max(64),
    x: finite,
    y: finite,
    rotation: finite.default(0),
    width: finite.positive(),
    height: finite.positive(),
    flipX: z.boolean().default(false),
    sizeProvenance: provenanceSchema.default("graphical"),
    physical: z.object({ width: dimensionValueSchema.nullable(), depth: dimensionValueSchema.nullable() }).nullable().default(null),
  }),
  z.object({
    type: z.literal("dimension"),
    a: pointSchema,
    b: pointSchema,
    offset: finite.default(20),
    override: dimensionValueSchema.nullable().default(null),
  }),
]);
export type Geometry = z.infer<typeof geometrySchema>;
export type GeometryType = Geometry["type"];

export const SCENE_OBJECT_KINDS = [
  "line",
  "polyline",
  "polygon",
  "rect",
  "ellipse",
  "arrow",
  "text",
  "callout",
  "stroke",
  "highlighter",
  "symbol",
  "dimension",
  "room",
  "damage_region",
  "room_label",
] as const;
export type SceneObjectKind = (typeof SCENE_OBJECT_KINDS)[number];
export const sceneObjectKindSchema = z.enum(SCENE_OBJECT_KINDS);

/** Semantic payload attached to a scene object (room, damage region, highlight). */
export const semanticSchema = z
  .object({
    role: z.enum(["graphic", "room_boundary", "damage_region", "highlight", "reference", "drying_chamber"]).default("graphic"),
    /** Drying chamber: stable per-map number behind the default name (never renumbered). */
    sequence: z.number().int().min(1).max(100000).nullable().optional(),
    /** Drying chamber: planning status — always a proposal, never an installed or verified condition. */
    status: z.enum(["proposed"]).nullable().optional(),
    legendToken: z.string().max(64).nullable().default(null),
    roomName: z.string().max(200).nullable().default(null),
    conditionId: z.string().uuid().nullable().default(null),
    importedReference: z.boolean().default(false),
    /** Wall-hosted fixture: follows its wall through move / split / cut (GEOM-05). Null = free symbol. */
    host: z.object({ wallId: z.string().uuid(), t: z.number().min(0).max(1), offset: z.number().finite() }).nullable().default(null),
  })
  .strict();
export type Semantic = z.infer<typeof semanticSchema>;

export const calibrationSchema = z.object({
  a: pointSchema,
  b: pointSchema,
  physicalLength: finite.positive(),
  unit: z.enum(["in", "ft", "mm", "cm", "m"]),
  metresPerWorldUnit: finite.positive(),
  calibratedBy: z.string().uuid().nullable(),
  calibratedAt: z.string().datetime({ offset: true }),
  sourceNote: z.string().max(500).default(""),
});
export type Calibration = z.infer<typeof calibrationSchema>;

export const anchorGeometrySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("point"), x: finite, y: finite }),
  z.object({ type: z.literal("polygon"), points: z.array(pointSchema).min(3).max(5000) }),
  z.object({ type: z.literal("line"), a: pointSchema, b: pointSchema }),
]);
export type AnchorGeometry = z.infer<typeof anchorGeometrySchema>;

/**
 * Typed condition vocabulary (DATA-04). These constants are the single source for the validator,
 * the release snapshot, exports and every UI control — a control can only offer what the
 * validator accepts, and free text lives in the separate note fields.
 */
export const EXTENT_HORIZONTAL = ["point", "linear", "area", "room", "surface", "wall_band", "unknown"] as const;
export const EXTENT_VERTICAL_REFERENCES = ["above_floor", "below_ceiling", "floor", "ceiling", "full_height", "unknown"] as const;
export const EXTENT_VERTICAL_BANDS = ["floor", "below_2ft", "below_4ft", "below_6ft", "majority", "top_down_minor", "trim_lower", "toe_kick", "cabinet", "ceiling", "custom"] as const;
export const LENGTH_UNITS = ["in", "ft", "mm", "cm", "m"] as const;
export const CONDITION_CONFIDENCES = ["observed", "suspected", "reported", "hypothesis", "lab_supported"] as const;
export const CONDITION_CONFIDENCE_LABEL: Record<(typeof CONDITION_CONFIDENCES)[number], string> = {
  observed: "Observed (seen directly)", suspected: "Suspected (indirect signs)", reported: "Reported (by occupant / third party)", hypothesis: "Hypothesis (unconfirmed)", lab_supported: "Lab supported (analysis on file)",
};
export const CONDITION_EVIDENCE_TYPES = ["visual", "meter", "thermal", "olfactory", "photo", "sample", "assessment", "reported"] as const;
export const CONDITION_DOMAINS = ["water", "mold", "fire", "demolition", "general"] as const;

export const extentSchema = z
  .object({
    horizontal: z.enum(EXTENT_HORIZONTAL).default("point"),
    verticalValue: finite.nonnegative().nullable().default(null),
    verticalUnit: z.enum(LENGTH_UNITS).nullable().default(null),
    verticalReference: z.enum(EXTENT_VERTICAL_REFERENCES).default("unknown"),
    verticalBand: z.enum(EXTENT_VERTICAL_BANDS).nullable().default(null),
    lengthValue: finite.nonnegative().nullable().default(null),
    areaValue: finite.nonnegative().nullable().default(null),
    quantityProvenance: provenanceSchema.default("unknown"),
  })
  .strict();
export type Extent = z.infer<typeof extentSchema>;
export const EMPTY_EXTENT: Extent = extentSchema.parse({});

export const verticalScopeSchema = z
  .object({
    band: extentSchema.shape.verticalBand,
    value: finite.nonnegative().nullable().default(null),
    unit: z.enum(["in", "ft", "mm", "cm", "m"]).nullable().default(null),
  })
  .strict();

/** Kind-specific record payloads (typed extensions live under `custom`). */
const customFields = z.record(z.string().max(64), z.union([z.string().max(4000), z.number().finite(), z.boolean(), z.null(), z.array(z.string().max(200)).max(50)])).default({});

export const recordPayloadSchemas = {
  moisture: z
    .object({
      visualFinding: z.string().max(2000).default(""),
      precision: z.enum(["exact", "approximate", "zone", "unknown"]).default("exact"),
      custom: customFields,
    })
    .strict(),
  sample: z.object({ custom: customFields }).strict(),
  observation: z
    .object({
      domain: z.enum(["water", "mold", "fire", "demolition", "general"]).default("general"),
      category: z.string().max(120).default(""),
      custom: customFields,
    })
    .strict(),
  photo: z.object({ direction: z.string().max(60).default(""), custom: customFields }).strict(),
  thermal: z
    .object({
      apparentTempValue: finite.nullable().default(null),
      apparentTempUnit: z.enum(["F", "C"]).nullable().default(null),
      deltaValue: finite.nullable().default(null),
      emissivity: z.number().min(0).max(1).nullable().default(null),
      reflectedTempValue: finite.nullable().default(null),
      pattern: z.string().max(400).default(""),
      isNotMoistureMeasurement: z.literal(true).default(true),
      custom: customFields,
    })
    .strict(),
  ambient: z
    .object({
      temperatureValue: finite.nullable().default(null),
      temperatureUnit: z.enum(["F", "C"]).nullable().default(null),
      relativeHumidity: z.number().min(0).max(100).nullable().default(null),
      dewPointValue: finite.nullable().default(null),
      gpp: finite.nullable().default(null),
      locationClass: z.enum(["indoor", "outdoor", "unaffected", "affected", "chamber"]).default("indoor"),
      instrumentLabel: z.string().max(120).default(""),
      custom: customFields,
    })
    .strict(),
  equipment: z
    .object({
      equipmentType: z.enum(["dehumidifier", "air_mover", "air_scrubber", "heater", "containment", "other"]).default("air_mover"),
      assetTag: z.string().max(120).default(""),
      placedAt: z.string().datetime({ offset: true }).nullable().default(null),
      removedAt: z.string().datetime({ offset: true }).nullable().default(null),
      custom: customFields,
    })
    .strict(),
  action: z.object({ custom: customFields }).strict(),
  limitation: z
    .object({
      reason: z.enum(["inaccessible", "occupied", "unsafe", "not_in_scope", "client_declined", "other"]).default("inaccessible"),
      custom: customFields,
    })
    .strict(),
} as const;

export const recordKindSchema = z.enum(["moisture", "sample", "observation", "photo", "thermal", "ambient", "equipment", "action", "limitation"]);

export function parseRecordPayload(kind: z.infer<typeof recordKindSchema>, payload: unknown) {
  return recordPayloadSchemas[kind].parse(payload ?? {});
}

/** Legend entry (company-versioned). */
export const legendEntrySchema = z
  .object({
    token: z.string().min(1).max(64),
    label: z.string().min(1).max(200),
    group: z.string().max(80).default(""),
    color: colorSchema,
    pattern: z.enum(["none", "hatch", "crosshatch", "dots", "diagonal", "solid"]).default("solid"),
    lineStyle: z.enum(["solid", "dashed", "dotted"]).default("solid"),
    symbol: z.string().max(64).nullable().default(null),
    domain: z.enum(["water", "mold", "fire", "demolition", "general", "samples", "actions", "info"]).default("general"),
    explanatory: z.boolean().default(false),
    sortOrder: z.number().int().default(0),
  })
  .strict();
export type LegendEntry = z.infer<typeof legendEntrySchema>;
export const legendEntriesSchema = z.array(legendEntrySchema).max(200);

/** Form builder schema (no code, formulas or HTML). */
export const formFieldSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
    label: z.string().min(1).max(200),
    type: z.enum(["short_text", "long_text", "integer", "decimal", "quantity", "datetime", "single_select", "multi_select", "checkbox", "reference", "attachment"]),
    options: z.array(z.string().max(200)).max(200).default([]),
    unitOptions: z.array(z.string().max(20)).max(20).default([]),
    requiredOnCapture: z.boolean().default(false),
    requiredOnReview: z.boolean().default(false),
    clientVisible: z.boolean().default(false),
    helpText: z.string().max(500).default(""),
  })
  .strict();
export const formSchema = z.object({ fields: z.array(formFieldSchema).max(100) }).strict();
export type FormField = z.infer<typeof formFieldSchema>;

/** Report profile layout (company-controlled). */
export const reportLayoutSchema = z
  .object({
    preset: z.enum(["modern", "legacy"]).default("modern"),
    pageSize: z.enum(["letter", "legal", "tabloid", "a4", "a3"]).default("letter"),
    orientation: z.enum(["portrait", "landscape"]).default("portrait"),
    headerTitle: z.string().max(120).default("Auxilium Environmental"),
    accentColor: colorSchema.default("#111827"),
    showLegend: z.boolean().default(true),
    showScaleNote: z.boolean().default(true),
    tablesAfterMaps: z.boolean().default(true),
    includePhotos: z.boolean().default(true),
    includeSamples: z.boolean().default(true),
    includeMonitoringPivot: z.boolean().default(true),
    footerText: z.string().max(300).default(""),
    logoAssetId: z.string().uuid().nullable().default(null),
    fontFamily: z.enum(["Helvetica", "TimesRoman", "Courier"]).default("Helvetica"),
    maxLabelFontPt: z.number().min(6).max(24).default(12),
    minLabelFontPt: z.number().min(4).max(12).default(6),
  })
  .strict();
export type ReportLayout = z.infer<typeof reportLayoutSchema>;

/** Personal preferences (never affect releases). */
export const userPreferencesSchema = z
  .object({
    theme: z.enum(["system", "light", "dark"]).default("system"),
    handedness: z.enum(["left", "right"]).default("right"),
    density: z.enum(["comfortable", "compact"]).default("comfortable"),
    favoriteTools: z.array(z.string().max(40)).max(24).default([]),
    favoriteColors: z.array(colorSchema).max(48).default([]),
    recentColors: z.array(colorSchema).max(16).default([]),
    toolbarOrder: z.array(z.string().max(40)).max(64).default([]),
    gridVisible: z.boolean().default(true),
    snapEnabled: z.boolean().default(true),
    defaultSplit: z.enum(["map", "grid", "split"]).default("map"),
    shortcuts: z.record(z.string().max(40), z.string().max(20)).default({}),
    highContrast: z.boolean().default(false),
    reducedMotion: z.boolean().default(false),
    quickAddOrder: z.array(recordKindSchema).max(9).default(["moisture", "sample", "observation", "photo"]),
    lastToolByProject: z.record(z.string().uuid(), z.string().max(40)).default({}),
    /** Last camera per map — personal view state, never part of the evidence record (SYNC-11). */
    cameraByCanvas: z.record(z.string().regex(/^[0-9a-f-]{36}(:(phone|tablet|desktop))?$/), z.array(z.number().finite()).length(6)).default({}),
    /** iPad: the pen draws, fingers navigate. */
    penOnly: z.boolean().default(false),
    /** Offset loupe during finger-precise drags (personal, never evidence). */
    loupe: z.boolean().default(true),
    /** Per-tool style presets remembered across sessions (highlighter opacity/width etc.). */
    toolStyles: z.record(z.string().max(40), styleSchema.partial()).default({}),
    /** Desktop/iPad split + inspector widths (percent per panel), keyed by the panel arrangement. Personal only. */
    panelLayout: z.record(z.string().max(40), z.record(z.string().max(40), z.number().min(0).max(100))).default({}),
  })
  .strict();
export type UserPreferences = z.infer<typeof userPreferencesSchema>;
export const DEFAULT_PREFERENCES: UserPreferences = userPreferencesSchema.parse({});

/** Mutation protocol. */
export const mutationOpSchema = z.object({
  op: z.enum(["upsert", "delete"]),
  entity: z.enum([
    "project", "site", "building", "level", "unit", "visit", "canvas", "layer", "underlay", "node", "wall", "opening", "scene_object",
    "location_group", "record", "anchor", "reading", "baseline", "sample", "condition", "action", "asset", "record_asset", "assignment",
    "material", "instrument", "instrument_configuration", "form_definition", "legend_definition", "report_profile", "scope_entry",
  ]),
  id: z.string().uuid(),
  expectedRevision: z.number().int().nonnegative(),
  data: z.record(z.string(), z.unknown()).optional(),
  cascadeEvidence: z.boolean().optional(),
});
export type MutationOp = z.infer<typeof mutationOpSchema>;

export const mutationSchema = z.object({
  mutationId: z.string().uuid(),
  organizationId: z.string().uuid().nullable(),
  projectId: z.string().uuid().nullable(),
  deviceId: z.string().min(1).max(120),
  label: z.string().max(200).default(""),
  createdAt: z.string().datetime({ offset: true }),
  ops: z.array(mutationOpSchema).min(1).max(500),
});
export type Mutation = z.infer<typeof mutationSchema>;

export type MutationEntityResult = { entity: MutationOp["entity"]; id: string; revision: number; data: JsonObject | null; noop?: boolean };
/**
 * Authoritative rejection reasons. Anything the server *decided* comes back as `ok: false` with one
 * of these; a thrown/transport error means the outcome is unknown and the client must retry the
 * identical envelope rather than roll back.
 */
export type MutationRejectionReason = "conflict" | "code_collision" | "legal_hold" | "dependents_exist" | "validation" | "forbidden" | "not_found";
export type MutationResult =
  | { ok: true; mutationId: string; projectRevision: number | null; entities: MutationEntityResult[]; appliedAt: string; replayed?: boolean }
  | { ok: false; mutationId: string; reason: MutationRejectionReason; detail: JsonObject | string };

export const externalLinkSchema = z.object({
  externalSystem: z.enum(["moldo", "auxilium_os", "other"]),
  externalProjectId: z.string().min(1).max(200),
  externalOrganizationId: z.string().max(200).nullable().default(null),
  label: z.string().max(200).default(""),
});
