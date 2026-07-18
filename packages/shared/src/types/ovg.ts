// OVG (Open Vehicle Garage) property data types

export type OvgDataSourceType = "csv" | "api";

export type OvgDataSourceConfig =
  | { type: "csv"; filePath?: string; url?: string; delimiter?: string; encoding?: string }
  | { type: "api"; baseUrl: string; endpoint: string; apiKey?: string; pagination?: { pageSize?: number } };

export type OvgIngestionRunStatus = "pending" | "running" | "completed" | "failed";

export type OvgVehicleCondition = "new" | "used" | "certified";

export type OvgTransmissionType = "automatic" | "manual";

export type OvgFuelType = "gasoline" | "diesel" | "electric" | "hybrid" | "other";

export type OvgDriveType = "AWD" | "FWD" | "RWD" | "4WD";

export type OvgListingStatus = "active" | "sold" | "expired";

// ---- Database row shapes (returned from queries) ----

export interface OvgDataSourceRow {
  id: string;
  companyId: string;
  name: string;
  type: OvgDataSourceType;
  config: OvgDataSourceConfig;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OvgPropertyListingRow {
  id: string;
  companyId: string;
  sourceId: string;
  ingestionRunId: string | null;
  externalId: string | null;
  title: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  price: number | null;
  mileage: number | null;
  vin: string | null;
  condition: OvgVehicleCondition | null;
  exteriorColor: string | null;
  interiorColor: string | null;
  transmission: OvgTransmissionType | null;
  fuelType: OvgFuelType | null;
  engine: string | null;
  driveType: OvgDriveType | null;
  description: string | null;
  images: string[] | null;
  locationCity: string | null;
  locationState: string | null;
  locationZip: string | null;
  sourceUrl: string | null;
  status: OvgListingStatus;
  rawData: Record<string, unknown> | null;
  ingestedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface OvgIngestionRunRow {
  id: string;
  companyId: string;
  sourceId: string;
  status: OvgIngestionRunStatus;
  recordsFetched: number;
  recordsIngested: number;
  recordsFailed: number;
  errors: string[] | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

// ---- API request/response shapes ----

export interface CreateOvgDataSourceRequest {
  name: string;
  type: OvgDataSourceType;
  config: OvgDataSourceConfig;
  enabled?: boolean;
}

export interface UpdateOvgDataSourceRequest {
  name?: string;
  config?: OvgDataSourceConfig;
  enabled?: boolean;
}

export interface TriggerIngestionResponse {
  runId: string;
  status: OvgIngestionRunStatus;
}

export interface ListOvgListingsQuery {
  sourceId?: string;
  make?: string;
  model?: string;
  yearMin?: number;
  yearMax?: number;
  priceMin?: number;
  priceMax?: number;
  status?: OvgListingStatus;
  limit?: number;
  offset?: number;
}

// ---- Raw record from connector ----
export interface RawRecord {
  [key: string]: unknown;
}

// ---- Connector interface (used by server services) ----
export interface ConnectorConfig {
  type: OvgDataSourceType;
  [key: string]: unknown;
}

export interface DataSourceConnector {
  readonly type: OvgDataSourceType;
  fetch(config: ConnectorConfig): AsyncGenerator<RawRecord>;
}
