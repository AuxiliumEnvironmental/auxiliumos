/**
 * Domain entity types. Rows keep the database column shape (snake_case) so that the
 * mutation protocol, offline cache, server and UI all share ONE canonical record; the
 * map, the grid, the inspector and exports are projections of these rows.
 *
 * No React, router, Supabase client or MOLDO imports in this folder.
 */
import type { Database } from "@/integrations/supabase/types";

type Tables = Database["public"]["Tables"];
export type Json = Database["public"]["Tables"]["map_records"]["Row"]["payload"];
/** JSON object shape accepted by server-function serialization and Postgres jsonb columns. */
export type JsonObject = { [key: string]: Json | undefined };
type Row<T extends keyof Tables> = Tables[T]["Row"];

export type Organization = Row<"map_organizations">;
export type Membership = Row<"map_memberships">;
export type Profile = Row<"map_profiles">;
export type Invitation = Omit<Row<"map_invitations">, "token_hash">;
export type UserPreferencesRow = Row<"map_user_preferences">;

export type Project = Row<"map_projects">;
export type ProjectAssignment = Row<"map_project_assignments">;
export type Site = Row<"map_sites">;
export type Building = Row<"map_buildings">;
export type Level = Row<"map_levels">;
export type Unit = Row<"map_units">;
export type Visit = Row<"map_visits">;
export type Canvas = Row<"map_canvases">;
export type Layer = Row<"map_layers">;
export type Underlay = Row<"map_underlays">;
export type Node = Row<"map_nodes">;
export type Wall = Row<"map_walls">;
export type Opening = Row<"map_openings">;
export type SceneObject = Row<"map_scene_objects">;
export type Material = Row<"map_materials">;
export type Instrument = Row<"map_instruments">;
export type InstrumentConfiguration = Row<"map_instrument_configurations">;
export type FormDefinition = Row<"map_form_definitions">;
export type LegendDefinition = Row<"map_legend_definitions">;
export type ReportProfile = Row<"map_report_profiles">;
export type LocationGroup = Row<"map_location_groups">;
export type FieldRecord = Row<"map_records">;
export type Anchor = Row<"map_anchors">;
export type Reading = Row<"map_readings">;
export type Baseline = Row<"map_baselines">;
export type Sample = Row<"map_samples">;
export type Condition = Row<"map_conditions">;
export type Action = Row<"map_actions">;
export type Asset = Row<"map_assets">;
export type RecordAsset = Row<"map_record_assets">;
export type Review = Row<"map_reviews">;
export type Release = Row<"map_releases">;
export type ReleaseArtifact = Row<"map_release_artifacts">;
export type ExternalLink = Row<"map_external_links">;
export type ViewerGrant = Omit<Row<"map_viewer_grants">, "token_hash">;
export type AuditEvent = Row<"map_audit_events">;
export type DeliveryJob = Row<"map_delivery_jobs">;
export type ProviderConnection = Omit<Row<"map_provider_connections">, "token_ciphertext">;
export type OutboxEvent = Row<"map_event_outbox">;
/** Pending table (not in generated types): one on-site scope entry per field record, or shared instruction text. */
export interface ScopeEntry {
  id: string; organization_id: string; project_id: string; entry_type: "item" | "instruction"; record_id: string | null;
  body: JsonObject; review_state: ReviewState; review_fingerprint: string | null; reviewed_by: string | null; reviewed_at: string | null;
  version: number; deleted_at: string | null; created_at: string; created_by: string | null; updated_at: string; updated_by: string | null;
}

export type RecordKind = Database["public"]["Enums"]["map_record_kind"];
export type Precision = Database["public"]["Enums"]["map_precision"];
export type MapRole = Database["public"]["Enums"]["map_role"];
export type ReadingQualifier = Database["public"]["Enums"]["map_reading_qualifier"];
export type ActionState = Database["public"]["Enums"]["map_action_state"];
export type ReviewState = Database["public"]["Enums"]["map_review_state"];

/** Entity names accepted by the atomic mutation function (server whitelist mirror). */
export const ENTITY_TABLES = {
  project: "map_projects",
  site: "map_sites",
  building: "map_buildings",
  level: "map_levels",
  unit: "map_units",
  visit: "map_visits",
  canvas: "map_canvases",
  layer: "map_layers",
  underlay: "map_underlays",
  node: "map_nodes",
  wall: "map_walls",
  opening: "map_openings",
  scene_object: "map_scene_objects",
  location_group: "map_location_groups",
  record: "map_records",
  anchor: "map_anchors",
  reading: "map_readings",
  baseline: "map_baselines",
  sample: "map_samples",
  condition: "map_conditions",
  action: "map_actions",
  asset: "map_assets",
  record_asset: "map_record_assets",
  assignment: "map_project_assignments",
  material: "map_materials",
  instrument: "map_instruments",
  instrument_configuration: "map_instrument_configurations",
  form_definition: "map_form_definitions",
  legend_definition: "map_legend_definitions",
  report_profile: "map_report_profiles",
  /** PENDING (local QA lane, feature-flagged): on-site scope entries; see supabase/pending/20260928010000. */
  scope_entry: "map_scope_entries",
} as const;

export type EntityName = keyof typeof ENTITY_TABLES;

export interface EntityRowMap {
  project: Project;
  site: Site;
  building: Building;
  level: Level;
  unit: Unit;
  visit: Visit;
  canvas: Canvas;
  layer: Layer;
  underlay: Underlay;
  node: Node;
  wall: Wall;
  opening: Opening;
  scene_object: SceneObject;
  location_group: LocationGroup;
  record: FieldRecord;
  anchor: Anchor;
  reading: Reading;
  baseline: Baseline;
  sample: Sample;
  condition: Condition;
  action: Action;
  asset: Asset;
  record_asset: RecordAsset;
  assignment: ProjectAssignment;
  material: Material;
  instrument: Instrument;
  instrument_configuration: InstrumentConfiguration;
  form_definition: FormDefinition;
  legend_definition: LegendDefinition;
  report_profile: ReportProfile;
  scope_entry: ScopeEntry;
}

export const SCENE_ENTITIES: readonly EntityName[] = [
  "layer",
  "underlay",
  "node",
  "wall",
  "opening",
  "scene_object",
  "anchor",
];
export const FIELD_ENTITIES: readonly EntityName[] = [
  "location_group",
  "record",
  "anchor",
  "reading",
  "baseline",
  "sample",
  "condition",
  "action",
  "record_asset",
  "asset",
  "visit",
];
export const ORG_ENTITIES: readonly EntityName[] = [
  "material",
  "instrument",
  "instrument_configuration",
  "form_definition",
  "legend_definition",
  "report_profile",
];

export const RECORD_KINDS: readonly RecordKind[] = [
  "moisture",
  "sample",
  "observation",
  "photo",
  "thermal",
  "ambient",
  "equipment",
  "action",
  "limitation",
];

export const RECORD_KIND_LABEL: Record<RecordKind, string> = {
  moisture: "Moisture point",
  sample: "Sample",
  observation: "Observation / note",
  photo: "Photo",
  thermal: "Thermal observation",
  ambient: "Ambient reading",
  equipment: "Equipment",
  action: "Action",
  limitation: "Limitation / inaccessible",
};

export const RECORD_KIND_SHORT: Record<RecordKind, string> = {
  moisture: "M",
  sample: "S",
  observation: "O",
  photo: "P",
  thermal: "T",
  ambient: "H",
  equipment: "E",
  action: "X",
  limitation: "L",
};

export const RECORD_KIND_LAYER: Record<RecordKind, string> = {
  moisture: "water",
  sample: "samples",
  observation: "observations",
  photo: "photos",
  thermal: "water",
  ambient: "observations",
  equipment: "equipment",
  action: "actions",
  limitation: "limitations",
};

export const ROLE_LABEL: Record<MapRole, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  technician: "Technician",
  reviewer: "Reviewer",
};

export function isManagerOrAbove(role: MapRole | null | undefined): boolean {
  return role === "owner" || role === "admin" || role === "manager";
}
export function isAdmin(role: MapRole | null | undefined): boolean {
  return role === "owner" || role === "admin";
}
