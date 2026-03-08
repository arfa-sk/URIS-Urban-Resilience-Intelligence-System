import type {
  City,
  DistrictWithScores,
  Signals,
  AnalysisResult,
  Alert,
  LiveSignals,
  SimulateResponse,
  TrendResponse,
} from "../types";

export async function getCities(): Promise<City[]> {
  const response = await fetch("/api/cities");
  if (!response.ok) throw new Error("Failed to fetch cities");
  return response.json();
}

export async function getDistricts(cityId: string): Promise<DistrictWithScores[]> {
  const normalized = cityId.trim().toLowerCase();
  const url = `/api/districts?city=${encodeURIComponent(normalized)}`;
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Pragma: "no-cache", "Cache-Control": "no-cache" },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error((err as { error?: string }).error ?? "Failed to fetch districts");
  }
  const data = (await response.json()) as DistrictWithScores[];
  const responseCityId = response.headers.get("X-City-Id")?.toLowerCase();
  if (responseCityId && responseCityId !== normalized) {
    throw new Error(`Wrong city in response: got ${responseCityId}, expected ${normalized}`);
  }
  if (Array.isArray(data) && data.length > 0 && data[0].cityId && data[0].cityId !== normalized) {
    throw new Error(`Wrong city in body: got ${data[0].cityId}, expected ${normalized}`);
  }
  return data;
}

export async function getAIAnalysis(
  district: string,
  signals: Signals
): Promise<AnalysisResult> {
  const response = await fetch("/api/analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ district, signals }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error((err as { error?: string }).error ?? "Analysis failed");
  }
  return response.json();
}

export async function getAlerts(cityId: string): Promise<Alert[]> {
  const normalized = cityId.trim().toLowerCase();
  const response = await fetch(`/api/alerts?city=${encodeURIComponent(normalized)}`, {
    cache: "no-store",
    headers: { Pragma: "no-cache" },
  });
  if (!response.ok) throw new Error("Failed to fetch alerts");
  return response.json();
}

export async function getLiveSignals(cityId: string): Promise<LiveSignals> {
  const normalized = cityId.trim().toLowerCase();
  const response = await fetch(`/api/signals/live?city=${encodeURIComponent(normalized)}`, {
    cache: "no-store",
    headers: { Pragma: "no-cache" },
  });
  if (!response.ok) throw new Error("Failed to fetch live signals");
  return response.json();
}

export async function getTrend(districtId: string): Promise<TrendResponse> {
  const response = await fetch(`/api/trend/${encodeURIComponent(districtId)}`);
  if (!response.ok) throw new Error("Failed to fetch trend");
  return response.json();
}

export async function simulateCascade(
  district: string,
  signals: Signals
): Promise<SimulateResponse> {
  const response = await fetch("/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ district, signals }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error((err as { error?: string }).error ?? "Simulation failed");
  }
  return response.json();
}
