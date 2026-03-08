// Shared API and domain types

export interface City {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface District {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** Set by API when using multi-city; e.g. "karachi" */
  cityId?: string;
}

export interface Signals {
  infrastructure: number;
  mobility: number;
  safety: number;
  economy: number;
  rainfall: number;
  complaints: number;
  job_postings: number;
  property_index: number;
}

export interface DistrictWithScores extends District {
  scores: Signals;
  overallRisk: string;
}

export interface AnalysisResult {
  risk_level: string;
  explanation: string;
  root_causes: string[];
  recommendations: string[];
  cascading_effects?: string;
  is_fallback?: boolean;
}

export interface Alert {
  id: number;
  type: string;
  district: string;
  message: string;
  severity: "low" | "medium" | "high";
}

export interface JobItem {
  title: string;
  company: string;
  location: string;
  source: string;
}

export interface PropertyItem {
  address: string;
  price: string;
  trend: string;
  source: string;
}

export interface NewsItem {
  title: string;
  sentiment: string;
  source: string;
}

export interface LiveSignals {
  jobs: JobItem[];
  property: PropertyItem[];
  news: NewsItem[];
  /** Server-set timestamp (ms) when signals were last fetched; optional for backwards compatibility */
  lastUpdated?: number;
}

export type ImpactLevel = "Low" | "Moderate" | "High" | "Severe";

export interface SimulatorStep {
  system: string;
  impact: ImpactLevel;
  detail: string;
}

export interface SimulateResponse {
  steps: SimulatorStep[];
  summary?: string;
}

export interface TrendPoint {
  name: string;
  risk: number;
}

export interface TrendResponse {
  data: TrendPoint[];
}
