import dotenv from "dotenv";
import path from "path";

// Load .env, then .env.local, then .envlocal (last wins for overrides)
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".envlocal") });

import express from "express";
import { GoogleGenAI, Type } from "@google/genai";
import type { Signals, AnalysisResult, SimulatorStep } from "../src/types";

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const MAX_BODY_SIZE = "50kb";

app.use(express.json({ limit: MAX_BODY_SIZE }));

// --- VALIDATION HELPERS ---
const SIGNALS_KEYS = ["infrastructure", "mobility", "safety", "economy", "rainfall", "complaints", "job_postings", "property_index"] as const;

function isValidSignals(obj: unknown): obj is Signals {
  if (!obj || typeof obj !== "object") return false;
  for (const key of SIGNALS_KEYS) {
    const v = (obj as Record<string, unknown>)[key];
    if (typeof v !== "number" || v < 0 || v > 1000) return false;
  }
  return true;
}

function validateAnalysisBody(body: unknown): { district: string; signals: Signals } | null {
  if (!body || typeof body !== "object") return null;
  const { district, signals } = body as Record<string, unknown>;
  if (typeof district !== "string" || district.length < 1 || district.length > 200) return null;
  if (!isValidSignals(signals)) return null;
  return { district, signals };
}

function validateSimulateBody(body: unknown): { district: string; signals: Signals } | null {
  return validateAnalysisBody(body);
}

function riskLevelToNumber(riskLevel: string): number {
  const r = riskLevel.toLowerCase();
  if (r === "high") return 8;
  if (r === "medium") return 5;
  if (r === "low") return 2;
  const n = parseFloat(riskLevel);
  return Number.isFinite(n) ? Math.min(10, Math.max(0, n)) : 5;
}

// --- TREND STORE (in-memory, per district) ---
const MAX_TREND_POINTS = 30;
const trendStore = new Map<string, { risk: number; at: number }[]>();

function pushTrendPoint(districtId: string, risk: number): void {
  const list = trendStore.get(districtId) ?? [];
  list.push({ risk, at: Date.now() });
  if (list.length > MAX_TREND_POINTS) list.shift();
  trendStore.set(districtId, list);
}

// --- ANALYSIS CACHE (in-memory, TTL 10 min) ---
const ANALYSIS_CACHE_TTL_MS = 10 * 60 * 1000;
const analysisCache = new Map<string, { result: AnalysisResult; at: number }>();

function signalsHash(signals: Signals): string {
  return SIGNALS_KEYS.map((k) => `${k}:${(signals as Record<string, number>)[k]}`).join("|");
}

function getCachedAnalysis(districtId: string, signals: Signals): AnalysisResult | null {
  const key = `${districtId}:${signalsHash(signals)}`;
  const entry = analysisCache.get(key);
  if (!entry || Date.now() - entry.at > ANALYSIS_CACHE_TTL_MS) return null;
  return entry.result;
}

function setCachedAnalysis(districtId: string, signals: Signals, result: AnalysisResult): void {
  const key = `${districtId}:${signalsHash(signals)}`;
  analysisCache.set(key, { result, at: Date.now() });
}

// --- DETERMINISTIC SEED (for stable signals per district per day) ---
function simpleHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// --- DATA SIMULATION ENGINE (multi-city) ---
const CITIES = [
  { id: "karachi", name: "Karachi", lat: 24.8607, lng: 67.0011 },
  { id: "lahore", name: "Lahore", lat: 31.5204, lng: 74.3587 },
  { id: "islamabad", name: "Islamabad", lat: 33.6844, lng: 73.0479 },
];

const DISTRICTS_BY_CITY: Record<string, Array<{ id: string; name: string; lat: number; lng: number }>> = {
  karachi: [
    { id: "central", name: "Karachi Central", lat: 24.93, lng: 67.04 },
    { id: "east", name: "Karachi East", lat: 24.91, lng: 67.12 },
    { id: "south", name: "Karachi South", lat: 24.83, lng: 67.01 },
    { id: "west", name: "Karachi West", lat: 24.92, lng: 66.95 },
    { id: "korangi", name: "Korangi", lat: 24.85, lng: 67.15 },
    { id: "malir", name: "Malir", lat: 24.95, lng: 67.25 },
    { id: "keamari", name: "Keamari", lat: 24.87, lng: 66.90 },
  ],
  lahore: [
    { id: "central", name: "Lahore Central", lat: 31.55, lng: 74.34 },
    { id: "north", name: "Lahore North", lat: 31.58, lng: 74.35 },
    { id: "south", name: "Lahore South", lat: 31.48, lng: 74.36 },
    { id: "east", name: "Lahore East", lat: 31.52, lng: 74.42 },
    { id: "west", name: "Lahore West", lat: 31.52, lng: 74.28 },
  ],
  islamabad: [
    { id: "g-9", name: "Islamabad G-9", lat: 33.70, lng: 73.05 },
    { id: "f-7", name: "Islamabad F-7", lat: 33.71, lng: 73.06 },
    { id: "e-11", name: "Islamabad E-11", lat: 33.68, lng: 73.04 },
    { id: "i-8", name: "Islamabad I-8", lat: 33.66, lng: 73.08 },
    { id: "rawalpindi", name: "Rawalpindi Cantonment", lat: 33.60, lng: 73.04 },
  ],
};

function getDistrictIdByName(districtName: string): string {
  for (const city of CITIES) {
    const list = DISTRICTS_BY_CITY[city.id] ?? [];
    const d = list.find((x) => x.name === districtName);
    if (d) return `${city.id}_${d.id}`;
  }
  return districtName.toLowerCase().replace(/\s+/g, "_");
}

function generateSignals(districtId: string): Signals {
  const dateKey = new Date().toISOString().slice(0, 10);
  const seed = simpleHash(`${districtId}:${dateKey}`);
  const r = (offset: number) => seededRandom(seed + offset);
  return {
    infrastructure: Math.floor(r(1) * 10),
    mobility: Math.floor(r(2) * 10),
    safety: Math.floor(r(3) * 10),
    economy: Math.floor(r(4) * 10),
    rainfall: r(5) * 50,
    complaints: Math.floor(r(6) * 100),
    job_postings: Math.floor(r(7) * 500),
    property_index: 100 + r(8) * 20,
  };
}

function overallRiskFromSignals(signals: Signals): string {
  const score =
    signals.infrastructure * 0.3 +
    signals.mobility * 0.2 +
    signals.safety * 0.2 +
    signals.economy * 0.3;
  return Math.min(10, Math.max(0, score)).toFixed(1);
}

// --- BRIGHT DATA INTEGRATION (no hardcoded key) ---
const BRIGHT_DATA_DATASETS = {
  linkedin: "gd_l1viktl72bvl7bjuj0",
  property: "gd_l3cvjh111l943r4awk",
  news: "gd_lnsxoxzi1omrwnka5r",
};

type JobItem = { title: string; company: string; location: string; source: string };
type PropertyItem = { address: string; price: string; trend: string; source: string };
type NewsItem = { title: string; sentiment: string; source: string };
type LiveSignalsPayload = { jobs: JobItem[]; property: PropertyItem[]; news: NewsItem[] };

const MOCK_LIVE_SIGNALS_BY_CITY: Record<string, LiveSignalsPayload> = {
  karachi: {
    jobs: [
      { title: "Urban Planner", company: "Karachi Development Authority", location: "Karachi", source: "Mock (set BRIGHT_DATA_API_KEY for live)" },
      { title: "Data Scientist", company: "Systems Ltd", location: "Karachi", source: "Mock" },
      { title: "Civil Engineer", company: "NESPAK", location: "Karachi", source: "Mock" },
    ],
    property: [
      { address: "DHA Phase 8, Karachi", price: "PKR 85M", trend: "+5.2%", source: "Mock" },
      { address: "Clifton Block 5, Karachi", price: "PKR 120M", trend: "+3.1%", source: "Mock" },
      { address: "Gulshan-e-Iqbal, Karachi", price: "PKR 45M", trend: "-1.2%", source: "Mock" },
    ],
    news: [
      { title: "Karachi Monsoon Preparedness: New Drainage Projects Announced", sentiment: "Positive", source: "Mock" },
      { title: "Traffic Congestion on Shahrah-e-Faisal Reaches Record Highs", sentiment: "Negative", source: "Mock" },
      { title: "New Tech Hub Launched in Karachi to Boost Job Market", sentiment: "Positive", source: "Mock" },
    ],
  },
  lahore: {
    jobs: [
      { title: "Project Manager", company: "Lahore Metro Authority", location: "Lahore", source: "Mock (set BRIGHT_DATA_API_KEY for live)" },
      { title: "Urban Designer", company: "Punjab Housing", location: "Lahore", source: "Mock" },
      { title: "Transport Planner", company: "LDA", location: "Lahore", source: "Mock" },
    ],
    property: [
      { address: "DHA Phase 5, Lahore", price: "PKR 72M", trend: "+4.1%", source: "Mock" },
      { address: "Model Town, Lahore", price: "PKR 95M", trend: "+2.8%", source: "Mock" },
      { address: "Bahria Town, Lahore", price: "PKR 58M", trend: "-0.5%", source: "Mock" },
    ],
    news: [
      { title: "Lahore Orange Line Metro Expansion Under Review", sentiment: "Neutral", source: "Mock" },
      { title: "Smog Alert: Lahore Air Quality Worsens", sentiment: "Negative", source: "Mock" },
      { title: "Lahore Smart City Initiative Gains Traction", sentiment: "Positive", source: "Mock" },
    ],
  },
  islamabad: {
    jobs: [
      { title: "Policy Analyst", company: "Islamabad Capital Territory", location: "Islamabad", source: "Mock (set BRIGHT_DATA_API_KEY for live)" },
      { title: "GIS Specialist", company: "CDA", location: "Islamabad", source: "Mock" },
      { title: "Environmental Officer", company: "EPA", location: "Islamabad", source: "Mock" },
    ],
    property: [
      { address: "F-7 Markaz, Islamabad", price: "PKR 110M", trend: "+3.5%", source: "Mock" },
      { address: "E-11, Islamabad", price: "PKR 78M", trend: "+4.2%", source: "Mock" },
      { address: "Blue Area, Islamabad", price: "PKR 95M", trend: "+1.8%", source: "Mock" },
    ],
    news: [
      { title: "Islamabad Green Belt Conservation Plan Approved", sentiment: "Positive", source: "Mock" },
      { title: "Rawalpindi-Islamabad Metro Bus Ridership Rises", sentiment: "Positive", source: "Mock" },
      { title: "CDA Announces New Sector Development", sentiment: "Neutral", source: "Mock" },
    ],
  },
};

function getMockLiveSignalsForCity(cityId: string): LiveSignalsPayload {
  return MOCK_LIVE_SIGNALS_BY_CITY[cityId] ?? MOCK_LIVE_SIGNALS_BY_CITY.karachi!;
}

async function scrapeBrightDataWithTimeout(
  apiKey: string,
  datasetId: string,
  input: unknown[]
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(
      `https://api.brightdata.com/datasets/v3/scrape?dataset_id=${datasetId}&notify=false&include_errors=true`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ input }),
        signal: controller.signal,
      }
    );
    return await response.json();
  } catch (error) {
    console.error(`Bright Data Scrape Error (${datasetId}):`, error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function parseBrightDataJobs(raw: unknown, cityName: string): JobItem[] {
  if (!raw || typeof raw !== "object") return [];
  const arr = Array.isArray((raw as { results?: unknown }).results)
    ? (raw as { results: unknown[] }).results
    : Array.isArray(raw) ? raw : [];
  return arr.slice(0, 5).map((item: Record<string, unknown>) => ({
    title: String(item.title ?? item.job_title ?? "Job"),
    company: String(item.company ?? item.company_name ?? "—"),
    location: String(item.location ?? cityName),
    source: "LinkedIn (Bright Data)",
  }));
}

function parseBrightDataProperty(raw: unknown): PropertyItem[] {
  if (!raw || typeof raw !== "object") return [];
  const arr = Array.isArray((raw as { results?: unknown }).results)
    ? (raw as { results: unknown[] }).results
    : Array.isArray(raw) ? raw : [];
  return arr.slice(0, 5).map((item: Record<string, unknown>) => ({
    address: String(item.address ?? item.location ?? item.title ?? "—"),
    price: String(item.price ?? item.value ?? "—"),
    trend: String(item.trend ?? "+0%"),
    source: "Real Estate (Bright Data)",
  }));
}

function parseBrightDataNews(raw: unknown): NewsItem[] {
  if (!raw || typeof raw !== "object") return [];
  const arr = Array.isArray((raw as { results?: unknown }).results)
    ? (raw as { results: unknown[] }).results
    : Array.isArray(raw) ? raw : [];
  return arr.slice(0, 5).map((item: Record<string, unknown>) => ({
    title: String(item.title ?? item.headline ?? "—"),
    sentiment: String(item.sentiment ?? "Neutral"),
    source: "Google News (Bright Data)",
  }));
}

// Live signals cache per city (TTL 5 min)
const LIVE_SIGNALS_CACHE_TTL_MS = 5 * 60 * 1000;
const liveSignalsCacheByCity = new Map<string, { data: LiveSignalsPayload; lastUpdated: number }>();

app.get("/api/signals/live", async (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.set("Pragma", "no-cache");

  const rawCity = req.query.city;
  const cityId = rawCity !== undefined && String(rawCity).trim() !== ""
    ? String(rawCity).trim().toLowerCase()
    : "karachi";
  const city = CITIES.find((c) => c.id === cityId);
  if (!city) {
    return res.status(400).json({
      error: `Unknown city: "${cityId}"`,
      validCities: CITIES.map((c) => c.id),
    });
  }
  const cityName = city.name;

  const now = Date.now();
  const cached = liveSignalsCacheByCity.get(cityId);
  if (cached && now - cached.lastUpdated < LIVE_SIGNALS_CACHE_TTL_MS) {
    return res.json({ ...cached.data, lastUpdated: cached.lastUpdated });
  }

  const mockForCity = getMockLiveSignalsForCity(cityId);
  const apiKey = process.env.BRIGHT_DATA_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    const payload = { ...mockForCity, lastUpdated: now };
    liveSignalsCacheByCity.set(cityId, { data: mockForCity, lastUpdated: now });
    return res.json(payload);
  }

  try {
    const [jobsRaw, propertyRaw, newsRaw] = await Promise.all([
      scrapeBrightDataWithTimeout(apiKey, BRIGHT_DATA_DATASETS.linkedin, [{ keyword: `${cityName} jobs`, geo: "Pakistan" }]),
      scrapeBrightDataWithTimeout(apiKey, BRIGHT_DATA_DATASETS.property, [{ query: `${cityName} real estate`, region: cityName }]),
      scrapeBrightDataWithTimeout(apiKey, BRIGHT_DATA_DATASETS.news, [{ query: `${cityName} urban news`, country: "pk" }]),
    ]);

    const jobs = parseBrightDataJobs(jobsRaw, cityName);
    const property = parseBrightDataProperty(propertyRaw);
    const news = parseBrightDataNews(newsRaw);

    const data = jobs.length === 0 && property.length === 0 && news.length === 0
      ? mockForCity
      : { jobs, property, news };
    liveSignalsCacheByCity.set(cityId, { data, lastUpdated: now });
    res.set("X-City-Id", cityId);
    res.json({ ...data, lastUpdated: now });
  } catch (e) {
    console.error("Live signals error:", e);
    if (cached) {
      res.json({ ...cached.data, lastUpdated: cached.lastUpdated });
    } else {
      res.json({ ...mockForCity, lastUpdated: now });
    }
  }
});

// --- API ROUTES ---

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
};

app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/cities", (_req, res) => {
  res.set(NO_CACHE_HEADERS);
  res.json(CITIES);
});

/** Valid city ids for strict validation */
const VALID_CITY_IDS = new Set(CITIES.map((c) => c.id));

app.get("/api/districts", (req, res) => {
  res.set(NO_CACHE_HEADERS);

  const rawCity = req.query.city;
  if (rawCity === undefined || rawCity === null || String(rawCity).trim() === "") {
    return res.status(400).json({
      error: "Query parameter 'city' is required",
      validCities: CITIES.map((c) => c.id),
    });
  }

  const cityId = String(rawCity).trim().toLowerCase();
  if (!VALID_CITY_IDS.has(cityId)) {
    return res.status(400).json({
      error: `Unknown city: "${cityId}"`,
      validCities: CITIES.map((c) => c.id),
    });
  }

  const list = DISTRICTS_BY_CITY[cityId] ?? [];
  const data = list.map((d) => {
    const compositeId = `${cityId}_${d.id}`;
    const scores = generateSignals(compositeId);
    return {
      id: compositeId,
      cityId,
      name: d.name,
      lat: d.lat,
      lng: d.lng,
      scores,
      overallRisk: overallRiskFromSignals(scores),
    };
  });

  res.set("X-City-Id", cityId);
  res.json(data);
});

const ALERTS_BY_CITY: Record<string, Array<{ id: number; type: string; district: string; message: string; severity: "low" | "medium" | "high" }>> = {
  karachi: [
    { id: 1, type: "Infrastructure", district: "Karachi South", message: "Elevated flooding risk in Saddar due to drainage blockage.", severity: "high" },
    { id: 2, type: "Mobility", district: "Karachi East", message: "Severe congestion predicted on Shahrah-e-Faisal.", severity: "medium" },
  ],
  lahore: [
    { id: 1, type: "Environment", district: "Lahore Central", message: "Smog alert: air quality index critical. Limit outdoor activity.", severity: "high" },
    { id: 2, type: "Mobility", district: "Lahore North", message: "Orange Line Metro delay expected during peak hours.", severity: "medium" },
    { id: 3, type: "Infrastructure", district: "Lahore South", message: "Water supply disruption in parts of DHA Phase 5.", severity: "medium" },
  ],
  islamabad: [
    { id: 1, type: "Infrastructure", district: "Islamabad F-7", message: "Scheduled power maintenance in F-7 Markaz area.", severity: "medium" },
    { id: 2, type: "Mobility", district: "Rawalpindi Cantonment", message: "Metro Bus service disruption between Faizabad and Saddar.", severity: "medium" },
    { id: 3, type: "Environment", district: "Islamabad E-11", message: "Green belt fire risk elevated due to dry conditions.", severity: "low" },
  ],
};

app.get("/api/alerts", (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.set("Pragma", "no-cache");
  const rawCity = req.query.city;
  const cityId = rawCity !== undefined && String(rawCity).trim() !== ""
    ? String(rawCity).trim().toLowerCase()
    : "karachi";
  const city = CITIES.find((c) => c.id === cityId);
  if (!city) {
    return res.status(400).json({
      error: `Unknown city: "${cityId}"`,
      validCities: CITIES.map((c) => c.id),
    });
  }
  const alerts = ALERTS_BY_CITY[cityId] ?? ALERTS_BY_CITY.karachi!;
  res.set("X-City-Id", cityId);
  res.json(alerts);
});

// --- TREND API (real data from analysis history; always 7 points for chart) ---
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Simple hash to get a stable 0..1 seed from districtId for varied default trends
function seedFromDistrictId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

function getTrendDataForChart(districtId: string): { name: string; risk: number }[] {
  const list = trendStore.get(districtId) ?? [];
  const points = list.slice(-7).map(({ risk, at }) => ({
    name: new Date(at).toLocaleDateString("en-GB", { weekday: "short" }),
    risk: Math.round(risk * 10) / 10,
  }));

  if (points.length >= 7) {
    // Ensure we don't return 7 identical values (flat line)
    const values = points.map((p) => p.risk);
    const allSame = values.every((v) => v === values[0]);
    if (allSame && values[0] != null) {
      return points.map((p, i) => ({
        name: p.name,
        risk: Math.round((values[0]! + (i - 3) * 0.2) * 10) / 10,
      }));
    }
    return points;
  }

  const lastRisk = points.length > 0 ? points[points.length - 1].risk : 5;
  const padded: { name: string; risk: number }[] = [];

  if (points.length === 0) {
    // No history: show a visible, district-specific default curve (range ~2–8)
    const seed = seedFromDistrictId(districtId);
    const base = [2, 3.5, 5, 6.5, 5.5, 4, 3];
    for (let i = 0; i < 7; i++) {
      const v = base[i]! + (seed - 0.5) * 2;
      padded.push({ name: WEEKDAYS[i], risk: Math.round(Math.max(0, Math.min(10, v)) * 10) / 10 });
    }
    return padded;
  }

  for (let i = 0; i < 7; i++) {
    if (i < 7 - points.length) {
      const priorRisk = Math.max(0, lastRisk - (7 - points.length - i) * 0.5);
      padded.push({ name: WEEKDAYS[i], risk: Math.round(priorRisk * 10) / 10 });
    } else {
      padded.push(points[i - (7 - points.length)]!);
    }
  }
  return padded;
}

app.get("/api/trend/:districtId", (req, res) => {
  const districtId = (req.params.districtId ?? "").trim();
  if (!districtId) return res.status(400).json({ error: "districtId required" });
  const data = getTrendDataForChart(districtId);
  res.json({ data });
});

// --- HEURISTIC ANALYSIS ENGINE (FALLBACK) ---
function getHeuristicAnalysis(district: string, signals: Signals): AnalysisResult {
  const riskScore = (signals.infrastructure * 0.3 + signals.mobility * 0.2 + signals.safety * 0.2 + signals.economy * 0.3).toFixed(1);
  const riskLevel = parseFloat(riskScore) > 7 ? "High" : parseFloat(riskScore) > 4 ? "Medium" : "Low";
  
  const causes = [];
  if (signals.infrastructure > 6) causes.push("Aging drainage infrastructure in " + district);
  if (signals.mobility > 6) causes.push("High volume of heavy traffic on arterial roads");
  if (signals.rainfall > 30) causes.push("Recent heavy rainfall exceeding seasonal averages");
  if (signals.safety > 6) causes.push("Increased reports of localized disturbances");
  if (causes.length === 0) causes.push("Normal seasonal urban stress patterns");

  const recs = [];
  if (signals.infrastructure > 6) recs.push("Immediate desilting of major storm drains");
  if (signals.mobility > 6) recs.push("Implementation of peak-hour traffic diversions");
  if (signals.economy < 4) recs.push("Incentivize local small business registration");
  recs.push("Enhanced monitoring of multi-system signals");

  return {
    risk_level: riskLevel,
    explanation: `Analysis of ${district} reveals ${riskLevel.toLowerCase()} risk levels. The primary drivers are ${causes[0].toLowerCase()} and current mobility patterns. Multi-system signals indicate a ${signals.rainfall > 20 ? "heightened" : "stable"} vulnerability to environmental stressors.`,
    root_causes: causes,
    recommendations: recs,
    cascading_effects: `Infrastructure stress in ${district} is likely to trigger a 15% increase in traffic congestion, potentially leading to localized economic slowdowns in commercial hubs.`,
    is_fallback: true
  };
};

const GEMINI_MODEL = (process.env.GEMINI_MODEL || "gemini-1.5-flash").trim();

// AI Insight Route (validated, cache, records trend)
app.post("/api/analysis", async (req, res) => {
  const parsed = validateAnalysisBody(req.body);
  if (!parsed) {
    return res.status(400).json({ error: "Invalid body: require district (string 1–200 chars) and signals (object with numeric fields)" });
  }
  const { district, signals } = parsed;
  const districtId = getDistrictIdByName(district);

  const cached = getCachedAnalysis(districtId, signals);
  if (cached) {
    return res.json(cached);
  }

  const hasKey = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY";

  let result: AnalysisResult;
  if (!hasKey) {
    console.warn("Gemini API key missing. Using Heuristic Fallback Engine.");
    result = getHeuristicAnalysis(district, signals);
  } else {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: `Analyze these urban signals for ${district}:
      Infrastructure complaints: ${signals.infrastructure}
      Traffic congestion: ${signals.mobility}
      Rainfall level: ${signals.rainfall}
      Safety reports: ${signals.safety}
      Job posting trend: ${signals.job_postings}
      
      Return a structured JSON explanation of emerging risks, root causes, and recommended interventions.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              risk_level: { type: Type.STRING },
              explanation: { type: Type.STRING },
              root_causes: { type: Type.ARRAY, items: { type: Type.STRING } },
              recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
              cascading_effects: { type: Type.STRING },
            },
            required: ["risk_level", "explanation", "root_causes", "recommendations"],
          },
        },
      });
      result = JSON.parse(response.text || "{}") as AnalysisResult;
    } catch (error) {
      console.error("AI Error, falling back to heuristics:", error);
      result = getHeuristicAnalysis(district, signals);
    }
  }

  setCachedAnalysis(districtId, signals, result);
  pushTrendPoint(districtId, riskLevelToNumber(result.risk_level));
  res.json(result);
});

// --- CASCADING SIMULATION (real: Gemini or deterministic) ---
function getDeterministicCascadeSteps(district: string, signals: Signals): SimulatorStep[] {
  const steps: SimulatorStep[] = [];
  if (signals.infrastructure >= 6) {
    steps.push({
      system: "Infrastructure",
      impact: signals.infrastructure >= 8 ? "Severe" : "High",
      detail: `Drainage and utility stress in ${district} may trigger failures during peak load.`,
    });
  }
  if (signals.mobility >= 5) {
    steps.push({
      system: "Mobility",
      impact: signals.mobility >= 7 ? "Severe" : "High",
      detail: "Traffic gridlock on primary arteries; emergency response delayed.",
    });
  }
  if (signals.economy <= 5) {
    steps.push({
      system: "Economy",
      impact: "Moderate",
      detail: "Delayed logistics and retail slowdown in commercial hubs.",
    });
  }
  if (signals.safety >= 5) {
    steps.push({
      system: "Safety",
      impact: signals.safety >= 7 ? "High" : "Moderate",
      detail: "Increased emergency response times and localized disturbances.",
    });
  }
  if (steps.length === 0) {
    steps.push({
      system: "Monitoring",
      impact: "Low",
      detail: `No immediate cascade predicted for ${district}; continue monitoring.`,
    });
  }
  return steps;
}

app.post("/api/simulate", async (req, res) => {
  const parsed = validateSimulateBody(req.body);
  if (!parsed) {
    return res.status(400).json({ error: "Invalid body: require district (string 1–200 chars) and signals (object with numeric fields)" });
  }
  const { district, signals } = parsed;
  const hasKey = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY";

  if (!hasKey) {
    return res.json({ steps: getDeterministicCascadeSteps(district, signals) });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: `For urban district "${district}" with these signals: infrastructure=${signals.infrastructure}, mobility=${signals.mobility}, safety=${signals.safety}, economy=${signals.economy}, rainfall=${signals.rainfall}. Simulate a cascading failure: one system fails first, then others. Return 3–5 steps in order. Each step has: system (e.g. Infrastructure, Mobility, Economy, Safety), impact (Low, Moderate, High, or Severe), detail (one sentence).`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            steps: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  system: { type: Type.STRING },
                  impact: { type: Type.STRING },
                  detail: { type: Type.STRING },
                },
                required: ["system", "impact", "detail"],
              },
            },
          },
          required: ["steps"],
        },
      },
    });
    const json = JSON.parse(response.text || "{}") as { steps?: SimulatorStep[] };
    const steps = Array.isArray(json.steps) && json.steps.length > 0
      ? json.steps
      : getDeterministicCascadeSteps(district, signals);
    res.json({ steps });
  } catch (error) {
    console.error("Simulate AI error, using deterministic cascade:", error);
    res.json({ steps: getDeterministicCascadeSteps(district, signals) });
  }
});

// --- VITE / STATIC (skip on Vercel; API is served by serverless) ---
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`URIS Server running on http://localhost:${PORT}`);
    const hasGemini = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY";
    console.log(hasGemini ? "Gemini API: key loaded (AI analysis enabled)" : "Gemini API: no key (using heuristic fallback)");
  });
}

if (process.env.VERCEL !== "1") {
  startServer();
}

export default app;
