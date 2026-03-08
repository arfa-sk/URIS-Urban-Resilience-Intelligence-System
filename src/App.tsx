import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  ShieldAlert, 
  TrendingUp, 
  Zap, 
  Layers, 
  FileText, 
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Info,
  Wind,
  Droplets,
  Car,
  MapPin
} from 'lucide-react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { getCities, getDistricts, getAIAnalysis, getAlerts, getLiveSignals, getTrend, simulateCascade } from './services/api';
import type { City, DistrictWithScores, AnalysisResult, Alert, LiveSignals, SimulatorStep, TrendPoint } from './types';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';

// --- COMPONENTS (enterprise design system) ---

const RiskBadge = ({ score }: { score: number }) => {
  const isHigh = score > 7;
  const isMedium = score > 4;
  const style = isHigh
    ? { backgroundColor: 'var(--uris-risk-high-bg)', color: 'var(--uris-risk-high)' }
    : isMedium
    ? { backgroundColor: 'var(--uris-risk-medium-bg)', color: 'var(--uris-risk-medium)' }
    : { backgroundColor: 'var(--uris-risk-low-bg)', color: 'var(--uris-risk-low)' };
  return (
    <span
      className="px-2.5 py-1 rounded-md text-xs font-semibold tracking-tight"
      style={style}
    >
      {score} / 10
    </span>
  );
};

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  trend?: number;
  /** CSS color for icon and bar (e.g. #0ea5e9) */
  accentColor?: string;
  /** 0–100 for optional mini bar under value; omit for no bar */
  valuePct?: number;
}
const StatCard = ({ title, value, icon: Icon, trend, accentColor, valuePct }: StatCardProps) => {
  const accent = accentColor ?? 'var(--uris-accent)';
  return (
    <div
      className="group p-4 rounded-[var(--uris-radius-lg)] border border-[var(--uris-border)] bg-[var(--uris-bg-surface)] transition-all duration-200 hover:border-[var(--uris-border)] hover:shadow-md hover:-translate-y-0.5"
      style={{ boxShadow: 'var(--uris-shadow-sm)' }}
    >
      <div className="flex justify-between items-start mb-2">
        <div
          className="p-2.5 rounded-[var(--uris-radius-md)] transition-colors duration-200"
          style={{ backgroundColor: `${accent}14` }}
        >
          <Icon size={18} className="transition-colors duration-200" style={{ color: accent }} />
        </div>
        {trend !== undefined && (
          <span
            className={`text-xs font-semibold tabular-nums ${trend >= 0 ? 'text-[var(--uris-risk-low)]' : 'text-[var(--uris-risk-high)]'}`}
          >
            {trend >= 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
      <div className="text-xl font-bold text-[var(--uris-text-primary)] tracking-tight">{value}</div>
      {valuePct != null && (
        <div className="mt-2 h-1.5 rounded-full bg-[var(--uris-bg-muted)] overflow-hidden">
          <div
            className="h-full rounded-full transition-[width] duration-500 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, valuePct))}%`, backgroundColor: accent }}
          />
        </div>
      )}
      <div className="text-[11px] text-[var(--uris-text-muted)] mt-1.5 uppercase tracking-widest font-medium">{title}</div>
    </div>
  );
};

const DEFAULT_TREND_DATA: TrendPoint[] = [
  { name: 'Mon', risk: 3 }, { name: 'Tue', risk: 4 }, { name: 'Wed', risk: 5 },
  { name: 'Thu', risk: 6 }, { name: 'Fri', risk: 5.5 }, { name: 'Sat', risk: 4 }, { name: 'Sun', risk: 3.5 },
];

const FALLBACK_LIVE_SIGNALS: LiveSignals = {
  jobs: [{ title: 'Sample role', company: '—', location: '—', source: 'Sample' }],
  property: [{ address: 'Sample listing', price: '—', trend: '—', source: 'Sample' }],
  news: [{ title: 'Sample headline', sentiment: 'neutral', source: 'Sample' }],
  lastUpdated: Date.now(),
};

// Fallback when API is unavailable so City/District dropdowns always work
const FALLBACK_CITIES: City[] = [
  { id: 'karachi', name: 'Karachi', lat: 24.8607, lng: 67.0011 },
  { id: 'lahore', name: 'Lahore', lat: 31.5204, lng: 74.3587 },
  { id: 'islamabad', name: 'Islamabad', lat: 33.6844, lng: 73.0479 },
];
const mkScores = (): DistrictWithScores['scores'] => ({
  infrastructure: 5, mobility: 5, safety: 5, economy: 5, rainfall: 20, complaints: 40, job_postings: 100, property_index: 110,
});
const FALLBACK_DISTRICTS: Record<string, DistrictWithScores[]> = {
  karachi: [
    { id: 'karachi_central', cityId: 'karachi', name: 'Karachi Central', lat: 24.93, lng: 67.04, scores: mkScores(), overallRisk: '5.0' },
    { id: 'karachi_east', cityId: 'karachi', name: 'Karachi East', lat: 24.91, lng: 67.12, scores: mkScores(), overallRisk: '5.0' },
    { id: 'karachi_south', cityId: 'karachi', name: 'Karachi South', lat: 24.83, lng: 67.01, scores: mkScores(), overallRisk: '5.0' },
    { id: 'karachi_west', cityId: 'karachi', name: 'Karachi West', lat: 24.92, lng: 66.95, scores: mkScores(), overallRisk: '5.0' },
    { id: 'karachi_korangi', cityId: 'karachi', name: 'Korangi', lat: 24.85, lng: 67.15, scores: mkScores(), overallRisk: '5.0' },
    { id: 'karachi_malir', cityId: 'karachi', name: 'Malir', lat: 24.95, lng: 67.25, scores: mkScores(), overallRisk: '5.0' },
    { id: 'karachi_keamari', cityId: 'karachi', name: 'Keamari', lat: 24.87, lng: 66.90, scores: mkScores(), overallRisk: '5.0' },
  ],
  lahore: [
    { id: 'lahore_central', cityId: 'lahore', name: 'Lahore Central', lat: 31.55, lng: 74.34, scores: mkScores(), overallRisk: '5.0' },
    { id: 'lahore_north', cityId: 'lahore', name: 'Lahore North', lat: 31.58, lng: 74.35, scores: mkScores(), overallRisk: '5.0' },
    { id: 'lahore_south', cityId: 'lahore', name: 'Lahore South', lat: 31.48, lng: 74.36, scores: mkScores(), overallRisk: '5.0' },
    { id: 'lahore_east', cityId: 'lahore', name: 'Lahore East', lat: 31.52, lng: 74.42, scores: mkScores(), overallRisk: '5.0' },
    { id: 'lahore_west', cityId: 'lahore', name: 'Lahore West', lat: 31.52, lng: 74.28, scores: mkScores(), overallRisk: '5.0' },
  ],
  islamabad: [
    { id: 'islamabad_g-9', cityId: 'islamabad', name: 'Islamabad G-9', lat: 33.70, lng: 73.05, scores: mkScores(), overallRisk: '5.0' },
    { id: 'islamabad_f-7', cityId: 'islamabad', name: 'Islamabad F-7', lat: 33.71, lng: 73.06, scores: mkScores(), overallRisk: '5.0' },
    { id: 'islamabad_e-11', cityId: 'islamabad', name: 'Islamabad E-11', lat: 33.68, lng: 73.04, scores: mkScores(), overallRisk: '5.0' },
    { id: 'islamabad_i-8', cityId: 'islamabad', name: 'Islamabad I-8', lat: 33.66, lng: 73.08, scores: mkScores(), overallRisk: '5.0' },
    { id: 'islamabad_rawalpindi', cityId: 'islamabad', name: 'Rawalpindi Cantonment', lat: 33.60, lng: 73.04, scores: mkScores(), overallRisk: '5.0' },
  ],
};

export default function App() {
  const [cities, setCities] = useState<City[]>([]);
  const [selectedCityId, setSelectedCityId] = useState<string>('');
  const [districtsByCity, setDistrictsByCity] = useState<Record<string, DistrictWithScores[]>>({});
  const [selectedDistrict, setSelectedDistrict] = useState<DistrictWithScores | null>(null);
  const selectedCity = cities.find((c) => c.id === selectedCityId) ?? null;
  const currentDistricts = selectedCityId ? (districtsByCity[selectedCityId] ?? []) : [];
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [view, setView] = useState<'map' | 'twin'>('map');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showSimulator, setShowSimulator] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<{ steps: SimulatorStep[] } | null>(null);
  const [liveSignals, setLiveSignals] = useState<LiveSignals | null>(null);
  const [trendData, setTrendData] = useState<TrendPoint[]>(DEFAULT_TREND_DATA);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [liveSignalsError, setLiveSignalsError] = useState<string | null>(null);
  const [liveSignalsLoading, setLiveSignalsLoading] = useState(false);

  const runSimulation = async () => {
    if (!selectedDistrict) return;
    setSimulating(true);
    setSimResult(null);
    try {
      const res = await simulateCascade(selectedDistrict.name, selectedDistrict.scores);
      setSimResult({ steps: res.steps });
    } catch (err) {
      console.error(err);
    } finally {
      setSimulating(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        setLiveSignalsError(null);
        let cityList: City[];
        try {
          cityList = await getCities();
        } catch {
          cityList = FALLBACK_CITIES;
        }
        if (cityList.length === 0) cityList = FALLBACK_CITIES;
        setCities(cityList);
        if (!selectedCityId) setSelectedCityId(cityList[0].id);
        else setLoading(false);
      } catch (err) {
        console.error(err);
        setCities(FALLBACK_CITIES);
        if (!selectedCityId) setSelectedCityId(FALLBACK_CITIES[0].id);
        setLoading(false);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    if (!selectedCityId) return;
    const cityId = selectedCityId;
    let cancelled = false;
    setAnalyzing(true);
    const fallback = FALLBACK_DISTRICTS[cityId];
    getDistricts(cityId)
      .then((d) => {
        if (cancelled) return;
        const list = Array.isArray(d) && d.length > 0 ? d : (fallback ?? []);
        setDistrictsByCity((prev) => ({ ...prev, [cityId]: list }));
        const next = list.length > 0 ? list[0] : null;
        setSelectedDistrict(next);
        if (next) {
          setAnalysisError(null);
          return getAIAnalysis(next.name, next.scores).then((res) => {
            if (!cancelled) setAnalysis(res);
          }).catch((e) => {
            if (!cancelled) setAnalysisError(e instanceof Error ? e.message : "Analysis failed");
          });
        } else {
          setAnalysis(null);
        }
      })
      .catch(() => {
        if (!cancelled && fallback?.length) {
          setDistrictsByCity((prev) => ({ ...prev, [cityId]: fallback }));
          setSelectedDistrict(fallback[0]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAnalyzing(false);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [selectedCityId]);

  useEffect(() => {
    if (!selectedDistrict?.id) return;
    getTrend(selectedDistrict.id)
      .then((r) => setTrendData(r.data.length > 0 ? r.data : DEFAULT_TREND_DATA))
      .catch(() => setTrendData(DEFAULT_TREND_DATA));
  }, [selectedDistrict?.id]);

  useEffect(() => {
    if (!selectedCityId) return;
    setAlerts([]);
    setLiveSignals(null);
    setLiveSignalsError(null);
    getLiveSignals(selectedCityId)
      .then((s) => {
        setLiveSignals(s);
        setLiveSignalsError(null);
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : "Live signals unavailable";
        setLiveSignalsError(msg.includes("fetch") || msg.includes("Failed") ? "Showing sample data (API unreachable)." : msg);
        setLiveSignals(FALLBACK_LIVE_SIGNALS);
      });
    getAlerts(selectedCityId)
      .then((a) => setAlerts(a))
      .catch(() => setAlerts([]));
  }, [selectedCityId]);

  const handleDistrictSelect = async (d: DistrictWithScores) => {
    setSelectedDistrict(d);
    setAnalyzing(true);
    setAnalysis(null);
    setAnalysisError(null);
    try {
      const res = await getAIAnalysis(d.name, d.scores);
      setAnalysis(res);
    } catch (err) {
      console.error(err);
      setAnalysisError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  const retryAnalysis = () => {
    if (selectedDistrict) {
      setAnalysisError(null);
      handleDistrictSelect(selectedDistrict);
    }
  };

  const refreshLiveSignals = async () => {
    if (!selectedCityId) return;
    setLiveSignalsError(null);
    setLiveSignalsLoading(true);
    try {
      const s = await getLiveSignals(selectedCityId);
      setLiveSignals(s);
      setLiveSignalsError(null);
    } catch (err) {
      setLiveSignalsError(err instanceof Error ? err.message : "Showing sample data (API unreachable).");
      setLiveSignals(FALLBACK_LIVE_SIGNALS);
    } finally {
      setLiveSignalsLoading(false);
    }
  };

  const formatLastUpdated = (ms?: number) => {
    if (ms == null) return null;
    const sec = Math.floor((Date.now() - ms) / 1000);
    if (sec < 60) return "Just now";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} min ago`;
    return `${Math.floor(min / 60)} h ago`;
  };

  if (loading) return (
    <div className="h-screen w-full flex items-center justify-center bg-[var(--uris-bg-base)]">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-6"
      >
        <div className="w-11 h-11 border-2 border-[var(--uris-border)] border-t-[var(--uris-accent)] rounded-full animate-spin" />
        <p className="text-[var(--uris-text-muted)] text-sm font-medium">Initializing Urban Intelligence</p>
      </motion.div>
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-[var(--uris-bg-base)] text-[var(--uris-text-primary)] font-sans overflow-hidden">
      <header className="h-14 border-b border-white/10 bg-[var(--uris-bg-header)] px-6 flex items-center justify-between shrink-0 z-10 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[var(--uris-accent)] flex items-center justify-center">
            <Activity size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">URIS</h1>
            <p className="text-[10px] text-white/60 uppercase tracking-widest leading-none">Urban Resilience Intelligence</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label htmlFor="uris-city-select" className="text-[10px] font-semibold text-white/70 uppercase tracking-wider">City</label>
            <div className="relative">
              <select
                id="uris-city-select"
                value={selectedCityId}
                onChange={(e) => {
                  setSelectedCityId(e.target.value);
                  setSelectedDistrict(null);
                }}
                className="bg-white/15 border border-white/30 text-white rounded-lg pl-3 pr-8 py-2 text-sm font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white/50 min-w-[140px] appearance-none"
                aria-label="Select city"
              >
                <option value="" className="text-[var(--uris-bg-header)] bg-white">Select city</option>
                {cities.map((c) => (
                  <option key={c.id} value={c.id} className="text-[var(--uris-bg-header)] bg-white">{c.name}</option>
                ))}
              </select>
              <ChevronDown size={18} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-white/80" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="uris-district-select" className="text-[10px] font-semibold text-white/70 uppercase tracking-wider">District</label>
            <div className="relative">
              <select
                id="uris-district-select"
                value={selectedDistrict?.cityId === selectedCityId ? (selectedDistrict?.id ?? '') : ''}
                onChange={(e) => {
                  const d = currentDistricts.find((x) => x.id === e.target.value);
                  if (d) handleDistrictSelect(d);
                }}
                className="bg-white/15 border border-white/30 text-white rounded-lg pl-3 pr-8 py-2 text-sm font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white/50 min-w-[180px] appearance-none"
                aria-label="Select district"
              >
                <option value="" className="text-[var(--uris-bg-header)] bg-white">Select district</option>
                {currentDistricts.map((d) => (
                  <option key={d.id} value={d.id} className="text-[var(--uris-bg-header)] bg-white">{d.name}</option>
                ))}
              </select>
              <ChevronDown size={18} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-white/80" />
            </div>
          </div>
        </div>
        <nav className="flex items-center gap-0.5 bg-white/5 p-0.5 rounded-lg">
          <button onClick={() => setView('map')} className={`px-4 py-2 rounded-md text-sm font-semibold transition-all ${view === 'map' ? 'bg-white text-[var(--uris-bg-header)]' : 'text-white/70 hover:text-white hover:bg-white/5'}`}>Risk Map</button>
          <button onClick={() => setView('twin')} className={`px-4 py-2 rounded-md text-sm font-semibold transition-all ${view === 'twin' ? 'bg-white text-[var(--uris-bg-header)]' : 'text-white/70 hover:text-white hover:bg-white/5'}`}>Digital Twin</button>
        </nav>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--uris-risk-high-bg)] border border-red-200/50">
            <ShieldAlert size={14} className="text-[var(--uris-risk-high)]" />
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--uris-risk-high)]">{alerts.length} Active Alerts</span>
          </div>
          <button className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition-colors"><Info size={20} /></button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden relative">
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="lg:hidden absolute bottom-6 left-6 z-50 w-12 h-12 bg-[var(--uris-bg-header)] text-white rounded-full flex items-center justify-center shadow-lg">
          <Layers size={20} />
        </button>

        <aside className={`${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 fixed lg:relative z-40 w-80 h-[calc(100vh-3.5rem)] border-r border-[var(--uris-border)] bg-white flex flex-col shrink-0 transition-transform duration-300 ease-out`}>
          <div className="p-4 border-b border-[var(--uris-border)]">
            <h2 className="text-[11px] font-bold text-[var(--uris-text-muted)] uppercase tracking-widest mb-3">{selectedCity?.name ?? 'City'} Districts</h2>
            <div className="space-y-2">
              {currentDistricts.map((d, i) => {
                const risk = parseFloat(d.overallRisk) || 0;
                const riskPct = Math.min(100, Math.max(0, (risk / 10) * 100));
                const isSelected = selectedDistrict?.id === d.id;
                return (
                  <motion.button
                    key={d.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    onClick={() => handleDistrictSelect(d)}
                    className={`w-full text-left p-3.5 rounded-[var(--uris-radius-lg)] transition-all duration-200 border ${isSelected ? 'bg-[var(--uris-bg-header)] border-[var(--uris-bg-header)] text-white shadow-md ring-1 ring-black/5' : 'bg-white border-[var(--uris-border)] hover:border-[var(--uris-text-muted)] hover:shadow-sm text-[var(--uris-text-secondary)]'}`}
                  >
                    <div className="flex justify-between items-center gap-2 mb-2">
                      <span className="font-semibold text-sm truncate">{d.name}</span>
                      <span className={`text-[11px] font-bold tabular-nums shrink-0 px-2 py-0.5 rounded-md ${isSelected ? 'bg-white/20 text-white' : 'bg-[var(--uris-bg-muted)] text-[var(--uris-text-primary)]'}`}>
                        {d.overallRisk}
                        <span className="opacity-70 font-normal text-[10px] ml-0.5">/10</span>
                      </span>
                    </div>
                    <div
                      className={`h-2 rounded-full overflow-hidden ${isSelected ? 'bg-white/15' : 'bg-[var(--uris-bg-muted)]'}`}
                      title={`Risk score ${d.overallRisk} / 10`}
                    >
                      <div
                        className="h-full rounded-full transition-[width] duration-300 ease-out"
                        style={{
                          width: `${riskPct}%`,
                          background: 'linear-gradient(90deg, #059669 0%, #65a30d 35%, #ca8a04 65%, #dc2626 100%)',
                        }}
                      />
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <h2 className="text-[11px] font-bold text-[var(--uris-text-muted)] uppercase tracking-widest mb-3">System Alerts</h2>
            <div className="space-y-2">
              {alerts.map(alert => (
                <div key={alert.id} className="p-3 rounded-[var(--uris-radius-md)] border border-[var(--uris-border)] bg-[var(--uris-bg-muted)]">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle size={14} className={alert.severity === 'high' ? 'text-[var(--uris-risk-high)]' : 'text-[var(--uris-risk-medium)]'} />
                    <span className="text-[10px] font-bold uppercase text-[var(--uris-text-muted)]">{alert.type}</span>
                  </div>
                  <p className="text-xs font-medium text-[var(--uris-text-secondary)] leading-relaxed">{alert.message}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <section className="flex-1 flex flex-col overflow-hidden relative">
          <div className="flex-1 relative bg-[var(--uris-bg-muted)]">
            <AnimatePresence mode="wait">
              {view === 'map' ? (
                <motion.div 
                  key="map"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="absolute inset-0 z-0"
                >
                  <MapContainer 
                    key={selectedCityId || 'map'}
                    center={selectedCity ? [selectedCity.lat, selectedCity.lng] : [24.8607, 67.0011]} 
                    zoom={11} 
                    style={{ height: '100%', width: '100%' }}
                    zoomControl={false}
                  >
                    <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
                    {currentDistricts.map(d => (
                      <CircleMarker
                        key={d.id}
                        center={[d.lat, d.lng]}
                        radius={14 + (parseFloat(d.overallRisk) * 1.8)}
                        pathOptions={{
                          fillColor: parseFloat(d.overallRisk) > 7 ? '#b91c1c' : parseFloat(d.overallRisk) > 4 ? '#b45309' : '#047857',
                          fillOpacity: 0.7,
                          color: 'white',
                          weight: 2
                        }}
                        eventHandlers={{
                          click: () => handleDistrictSelect(d)
                        }}
                      >
                        <Popup>
                          <div className="p-1">
                            <h3 className="font-bold text-sm mb-1">{d.name}</h3>
                            <p className="text-xs text-slate-500">Risk Score: {d.overallRisk}</p>
                          </div>
                        </Popup>
                      </CircleMarker>
                    ))}
                  </MapContainer>
                </motion.div>
              ) : (
                <motion.div
                  key="twin"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-[var(--uris-bg-muted)] flex flex-col overflow-hidden"
                >
                  {/* Header: title (city/district changed via global header) */}
                  <div className="shrink-0 px-6 py-4 border-b border-[var(--uris-border)] bg-white flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-3">
                      <div className="px-2.5 py-1 bg-[var(--uris-accent)]/15 text-[var(--uris-accent)] rounded-md text-[10px] font-bold uppercase tracking-widest border border-[var(--uris-accent)]/30">
                        Digital Twin
                      </div>
                      <p className="text-sm text-[var(--uris-text-muted)]">
                        {selectedCity && selectedDistrict
                          ? `Live view: ${selectedCity.name} → ${selectedDistrict.name}`
                          : 'Live view of urban system stress — select city & district in the header above'}
                      </p>
                    </div>
                  </div>

                  {/* Main content: system cards + context */}
                  <div className="flex-1 overflow-y-auto p-6">
                    {selectedDistrict ? (
                      <div className="max-w-4xl mx-auto space-y-6">
                        <div className="flex items-center gap-2 text-[var(--uris-text-muted)] text-sm">
                          <MapPin size={14} />
                          <span>{selectedDistrict.name}</span>
                          <span className="text-xs">·</span>
                          <span className="text-xs font-mono">LAT {selectedDistrict.lat} / LNG {selectedDistrict.lng}</span>
                          <span className="text-xs">·</span>
                          <span className="text-xs">Overall risk: <strong className="text-[var(--uris-text-primary)]">{selectedDistrict.overallRisk}/10</strong></span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {[
                            { key: 'infra' as const, label: 'Infrastructure', icon: Droplets, score: selectedDistrict.scores.infrastructure, color: 'var(--uris-accent)' },
                            { key: 'mobility' as const, label: 'Mobility', icon: Car, score: selectedDistrict.scores.mobility, color: '#059669' },
                            { key: 'safety' as const, label: 'Safety', icon: ShieldAlert, score: selectedDistrict.scores.safety, color: 'var(--uris-risk-high)' },
                          ].map(({ key, label, icon: Icon, score, color }) => {
                            const status = score > 7 ? 'High' : score > 4 ? 'Moderate' : 'Low';
                            const statusClass = score > 7 ? 'text-[var(--uris-risk-high)]' : score > 4 ? 'text-[var(--uris-risk-medium)]' : 'text-[var(--uris-risk-low)]';
                            return (
                              <motion.div
                                key={key}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.05 }}
                                className="rounded-[var(--uris-radius-lg)] border border-[var(--uris-border)] bg-white p-5 shadow-[var(--uris-shadow-sm)]"
                              >
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center gap-2">
                                    <div className="p-2 rounded-[var(--uris-radius-sm)] bg-[var(--uris-bg-muted)]">
                                      <Icon size={18} style={{ color }} />
                                    </div>
                                    <span className="text-sm font-bold text-[var(--uris-text-primary)]">{label}</span>
                                  </div>
                                  <span className={`text-xs font-semibold uppercase tracking-wider ${statusClass}`}>{status}</span>
                                </div>
                                <div className="text-2xl font-bold text-[var(--uris-text-primary)] mb-2">{score}<span className="text-sm font-normal text-[var(--uris-text-muted)]">/10</span></div>
                                <div className="h-2 rounded-full bg-[var(--uris-bg-muted)] overflow-hidden">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${(score / 10) * 100}%` }}
                                    transition={{ duration: 0.5, ease: 'easeOut' }}
                                    className="h-full rounded-full"
                                    style={{ backgroundColor: color }}
                                  />
                                </div>
                                <p className="text-[11px] text-[var(--uris-text-muted)] mt-2">
                                  {score > 7 && `${label} stress is elevated; consider interventions.`}
                                  {score > 4 && score <= 7 && `Moderate ${label.toLowerCase()} load; monitor.`}
                                  {score <= 4 && `${label} within normal range.`}
                                </p>
                              </motion.div>
                            );
                          })}
                        </div>

                        <div className="rounded-[var(--uris-radius-lg)] border border-[var(--uris-border)] bg-white p-4">
                          <h4 className="text-[11px] font-bold text-[var(--uris-text-muted)] uppercase tracking-widest mb-2">At a glance</h4>
                          <p className="text-sm text-[var(--uris-text-secondary)] leading-relaxed">
                            {(() => {
                              const { infrastructure, mobility, safety } = selectedDistrict.scores;
                              const top = Math.max(infrastructure, mobility, safety);
                              const name = top === infrastructure ? 'Infrastructure' : top === mobility ? 'Mobility' : 'Safety';
                              return (
                                <>Primary stress in this district is <strong>{name}</strong> ({top}/10). Use the Risk Map to compare districts or run the Simulator from the right panel to see cascading effects.</>
                              );
                            })()}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-[var(--uris-text-muted)] gap-2">
                        <Layers size={40} strokeWidth={1.5} />
                        <p className="text-sm">Select a district from the sidebar or use the dropdown above</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
              <button className="bg-white p-2 rounded-lg border border-[var(--uris-border)] text-slate-600 hover:text-slate-900 shadow-sm"><Layers size={20} /></button>
              <button className="bg-white p-2 rounded-lg border border-[var(--uris-border)] text-slate-600 hover:text-slate-900 shadow-sm"><Wind size={20} /></button>
            </div>
          </div>

          <div className="h-1/3 border-t border-[var(--uris-border)] bg-white flex overflow-hidden shrink-0">
            <div className="w-1/2 border-r border-[var(--uris-border)] p-6 overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-sm font-bold text-[var(--uris-text-primary)] flex items-center gap-2">
                  <Zap size={16} className="text-[var(--uris-accent)]" />
                  AI Intelligence: {selectedDistrict?.name}
                </h2>
                {analyzing && <span className="text-[10px] font-bold text-[var(--uris-accent)] animate-pulse uppercase tracking-widest">Analyzing…</span>}
              </div>
              {analysis?.is_fallback && (
                <div className="mb-4 p-2.5 rounded-lg bg-[var(--uris-accent-muted)] border border-[var(--uris-accent)]/20 flex items-center gap-2">
                  <Info size={12} className="text-[var(--uris-accent)] shrink-0" />
                  <p className="text-[10px] text-[var(--uris-accent-hover)] font-bold uppercase tracking-wider">Heuristic mode</p>
                </div>
              )}
              {analysisError ? (
                <div className="flex flex-col items-center justify-center text-[var(--uris-risk-high)] gap-3 py-4">
                  <AlertTriangle size={28} />
                  <p className="text-xs text-center">{analysisError}</p>
                  <button onClick={retryAnalysis} className="px-3 py-1.5 rounded-md bg-[var(--uris-accent)] text-white text-xs font-semibold hover:opacity-90">Retry</button>
                </div>
              ) : !analysis && !analyzing ? (
                <div className="flex flex-col items-center justify-center text-[var(--uris-text-muted)] gap-2 py-4">
                  <Activity size={32} strokeWidth={1} />
                  <p className="text-xs">Select a district to generate AI insights</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 rounded-[var(--uris-radius-lg)] border border-[var(--uris-border)] bg-[var(--uris-bg-muted)]">
                    <div className="flex items-center gap-2 mb-2">
                      <RiskBadge score={parseFloat(selectedDistrict?.overallRisk || '0')} />
                      <span className="text-[11px] font-bold text-[var(--uris-text-muted)] uppercase tracking-wider">Risk Level</span>
                    </div>
                    <div className="text-sm text-[var(--uris-text-secondary)] leading-relaxed prose prose-sm max-w-none [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-4">
                      {analysis?.explanation ? (
                        <Markdown>{analysis.explanation}</Markdown>
                      ) : (
                        <p>Awaiting AI reasoning…</p>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h3 className="text-[10px] font-bold text-[var(--uris-text-muted)] uppercase tracking-widest mb-2">Root Causes</h3>
                      <ul className="space-y-1.5">
                        {analysis?.root_causes?.map((cause: string, i: number) => (
                          <li key={i} className="text-xs text-[var(--uris-text-secondary)] flex items-start gap-2">
                            <span className="w-1 h-1 bg-[var(--uris-text-muted)] rounded-full mt-1.5 shrink-0" />
                            {cause}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h3 className="text-[10px] font-bold text-[var(--uris-text-muted)] uppercase tracking-widest mb-2">Recommendations</h3>
                      <ul className="space-y-1.5">
                        {analysis?.recommendations?.map((rec: string, i: number) => (
                          <li key={i} className="text-xs text-[var(--uris-text-secondary)] flex items-start gap-2">
                            <span className="w-1 h-1 bg-[var(--uris-accent)] rounded-full mt-1.5 shrink-0" />
                            {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="w-1/2 p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-sm font-bold text-[var(--uris-text-primary)] flex items-center gap-2">
                  <TrendingUp size={16} className="text-[var(--uris-accent)]" />
                  Risk Trend
                </h2>
              </div>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData.length > 0 ? trendData : DEFAULT_TREND_DATA}>
                    <defs>
                      <linearGradient id="colorRisk" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--uris-chart-stroke)" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="var(--uris-chart-stroke)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--uris-border-subtle)" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--uris-text-muted)' }} />
                    <YAxis hide domain={[0, 10]} />
                    <Tooltip contentStyle={{ borderRadius: 'var(--uris-radius)', border: '1px solid var(--uris-border)', fontSize: '12px' }} />
                    <Area type="monotone" dataKey="risk" stroke="var(--uris-chart-stroke)" strokeWidth={2} fillOpacity={1} fill="url(#colorRisk)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </section>

        <aside className="hidden xl:flex w-72 border-l border-[var(--uris-border)] bg-white p-6 shrink-0 flex-col overflow-y-auto">
          <h2 className="text-[11px] font-bold text-[var(--uris-text-muted)] uppercase tracking-widest mb-5">District Vitals</h2>
          <div className="space-y-3 mb-6">
            <StatCard
              title="Infra Stress"
              value={selectedDistrict?.scores?.infrastructure != null ? `${Math.round(selectedDistrict.scores.infrastructure * 10)}%` : '—'}
              icon={Droplets}
              trend={12}
              accentColor="#0d9488"
              valuePct={selectedDistrict?.scores?.infrastructure != null ? selectedDistrict.scores.infrastructure * 10 : undefined}
            />
            <StatCard
              title="Mobility Index"
              value={selectedDistrict?.scores?.mobility != null ? `${Math.round(selectedDistrict.scores.mobility * 10)}%` : '—'}
              icon={Car}
              trend={-5}
              accentColor="#d97706"
              valuePct={selectedDistrict?.scores?.mobility != null ? selectedDistrict.scores.mobility * 10 : undefined}
            />
            <StatCard
              title="Economic Activity"
              value={selectedDistrict?.scores?.job_postings ?? '—'}
              icon={TrendingUp}
              trend={8}
              accentColor="#059669"
            />
          </div>
          <h2 className="text-[11px] font-bold text-[var(--uris-text-muted)] uppercase tracking-widest mb-3">Interventions</h2>
          <div className="mb-6">
            <button onClick={() => setShowSimulator(true)} className="w-full flex items-center justify-between p-3 rounded-[var(--uris-radius-lg)] bg-[var(--uris-accent)] hover:bg-[var(--uris-accent-hover)] text-white transition-colors font-semibold">
              <div className="flex items-center gap-3">
                <Zap size={14} />
                <span className="text-xs">Run Simulator</span>
              </div>
              <ChevronRight size={14} />
            </button>
          </div>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-[11px] font-bold text-[var(--uris-text-muted)] uppercase tracking-widest">Live Signals</h2>
            <div className="flex items-center gap-2">
              {liveSignals?.lastUpdated != null && (
                <span className="text-[9px] text-[var(--uris-text-muted)]">{formatLastUpdated(liveSignals.lastUpdated)}</span>
              )}
              <button onClick={refreshLiveSignals} disabled={liveSignalsLoading} className="text-[10px] font-bold text-[var(--uris-accent)] hover:text-[var(--uris-accent-hover)] uppercase tracking-widest flex items-center gap-1 disabled:opacity-50">
                {liveSignalsLoading ? "…" : <><Zap size={10} /> Refresh</>}
              </button>
            </div>
          </div>
          {liveSignalsError && (
            <div className="mb-3 p-2 rounded-md bg-[var(--uris-risk-high-bg)] border border-[var(--uris-risk-high)]/30 flex items-center justify-between gap-2">
              <span className="text-[10px] text-[var(--uris-risk-high)]">{liveSignalsError}</span>
              <button onClick={refreshLiveSignals} className="text-[10px] font-bold text-[var(--uris-risk-high)] hover:underline">Retry</button>
            </div>
          )}
          <div className="space-y-3">
            {liveSignals?.news && (
              <div className="p-3 rounded-[var(--uris-radius-md)] border border-[var(--uris-border)] bg-[var(--uris-bg-muted)]">
                <div className="flex items-center gap-2 mb-2">
                  <FileText size={14} className="text-[var(--uris-accent)]" />
                  <span className="text-[10px] font-bold uppercase text-[var(--uris-text-muted)]">News</span>
                </div>
                <div className="space-y-2">
                  {liveSignals.news.slice(0, 2).map((n, i) => (
                    <div key={i} className="text-[11px] leading-tight">
                      <div className="font-semibold text-[var(--uris-text-primary)]">{n.title}</div>
                      <div className="text-[9px] text-[var(--uris-text-muted)] mt-0.5">{n.source} · {n.sentiment}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {liveSignals?.jobs && (
              <div className="p-3 rounded-[var(--uris-radius-md)] border border-[var(--uris-border)] bg-[var(--uris-bg-muted)]">
                <div className="flex items-center gap-2 mb-2">
                  <Activity size={14} className="text-[var(--uris-risk-low)]" />
                  <span className="text-[10px] font-bold uppercase text-[var(--uris-text-muted)]">Jobs</span>
                </div>
                <div className="space-y-2">
                  {liveSignals.jobs.slice(0, 2).map((j, i) => (
                    <div key={i} className="text-[11px] leading-tight">
                      <div className="font-semibold text-[var(--uris-text-primary)]">{j.title}</div>
                      <div className="text-[9px] text-[var(--uris-text-muted)] mt-0.5">{j.company} · {j.location}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {liveSignals?.property && (
              <div className="p-3 rounded-[var(--uris-radius-md)] border border-[var(--uris-border)] bg-[var(--uris-bg-muted)]">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp size={14} className="text-[var(--uris-risk-medium)]" />
                  <span className="text-[10px] font-bold uppercase text-[var(--uris-text-muted)]">Property</span>
                </div>
                <div className="space-y-2">
                  {liveSignals.property.slice(0, 2).map((p, i) => (
                    <div key={i} className="text-[11px] leading-tight">
                      <div className="font-semibold text-[var(--uris-text-primary)]">{p.address}</div>
                      <div className="text-[9px] text-[var(--uris-text-muted)] mt-0.5">{p.price} · {p.trend}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="mt-6 p-4 rounded-[var(--uris-radius-lg)] bg-[var(--uris-accent-muted)] border border-[var(--uris-accent)]/20">
            <h3 className="text-[11px] font-bold text-[var(--uris-accent-hover)] uppercase tracking-wider mb-2">Resilience Tip</h3>
            <p className="text-[11px] text-[var(--uris-text-secondary)] leading-relaxed">
              Early warning signals suggest a 15% increase in infrastructure stress in Korangi. Proactive maintenance could reduce cascading traffic losses.
            </p>
          </div>
        </aside>
      </main>

        {/* Cascading Simulator Modal */}
        <AnimatePresence>
          {showSimulator && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-[var(--uris-bg-header)]/80 backdrop-blur-md flex items-center justify-center p-6"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 12 }}
                transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                className="bg-[var(--uris-bg-surface)] w-full max-w-2xl rounded-[var(--uris-radius-xl)] overflow-hidden flex flex-col border border-[var(--uris-border)]"
                style={{ boxShadow: 'var(--uris-shadow-lg)' }}
              >
                <div className="p-5 border-b border-[var(--uris-border)] flex justify-between items-center bg-[var(--uris-bg-muted)]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-[var(--uris-radius-md)] bg-[var(--uris-accent)] flex items-center justify-center text-white">
                      <Zap size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-[var(--uris-text-primary)]">Cascading Risk Simulator</h3>
                      <p className="text-xs text-[var(--uris-text-muted)]">Modeling system failures for {selectedDistrict?.name}</p>
                    </div>
                  </div>
                  <button onClick={() => setShowSimulator(false)} className="p-2 rounded-lg text-[var(--uris-text-muted)] hover:text-[var(--uris-text-primary)] hover:bg-[var(--uris-border)] transition-colors">
                    <ChevronRight className="rotate-90" size={20} />
                  </button>
                </div>

                <div className="p-6 flex-1">
                  {!simResult && !simulating ? (
                    <div className="text-center py-10">
                      <div className="w-16 h-16 rounded-full bg-[var(--uris-accent-muted)] flex items-center justify-center mx-auto mb-5">
                        <Activity size={32} className="text-[var(--uris-accent)]" />
                      </div>
                      <h4 className="font-bold text-xl text-[var(--uris-text-primary)] mb-2">Ready to Simulate</h4>
                      <p className="text-[var(--uris-text-muted)] text-sm max-w-sm mx-auto mb-8">
                        AI will simulate how a failure in one urban system triggers a chain reaction across Karachi.
                      </p>
                      <button
                        onClick={runSimulation}
                        className="px-6 py-2.5 rounded-[var(--uris-radius-md)] bg-[var(--uris-bg-header)] text-white font-semibold hover:opacity-90 transition-opacity"
                      >
                        Initiate Simulation
                      </button>
                    </div>
                  ) : simulating ? (
                    <div className="py-16 flex flex-col items-center gap-5">
                      <div className="relative w-14 h-14">
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                          className="absolute inset-0 border-2 border-[var(--uris-border)] border-t-[var(--uris-accent)] rounded-full"
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Zap size={28} className="text-[var(--uris-accent)]" />
                        </div>
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-[var(--uris-text-primary)]">Processing cascading effects</p>
                        <p className="text-[11px] text-[var(--uris-text-muted)] mt-1 uppercase tracking-widest">Analyzing dependencies</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-3">
                        {simResult.steps.map((step, i) => (
                          <motion.div
                            initial={{ opacity: 0, x: -12 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.12 }}
                            key={i}
                            className="flex items-center gap-4 p-4 rounded-[var(--uris-radius-lg)] border border-[var(--uris-border)] bg-[var(--uris-bg-muted)]"
                          >
                            <div
                              className={`w-10 h-10 rounded-[var(--uris-radius-md)] flex items-center justify-center text-white font-bold ${step.impact === 'High' || step.impact === 'Severe' ? 'bg-[var(--uris-risk-high)]' : 'bg-[var(--uris-risk-medium)]'}`}
                            >
                              {i + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-center gap-2 mb-1">
                                <span className="font-bold text-sm text-[var(--uris-text-primary)]">{step.system}</span>
                                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-[var(--uris-bg-surface)] border border-[var(--uris-border)] text-[var(--uris-text-secondary)] shrink-0">{step.impact} Impact</span>
                              </div>
                              <p className="text-xs text-[var(--uris-text-secondary)] leading-relaxed">{step.detail}</p>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                      <div className="p-4 rounded-[var(--uris-radius-lg)] bg-[var(--uris-risk-high-bg)] border border-red-200/60">
                        <div className="flex items-center gap-2 mb-2 text-[var(--uris-risk-high)]">
                          <AlertTriangle size={16} />
                          <span className="text-[11px] font-bold uppercase tracking-wider">Critical vulnerability</span>
                        </div>
                        <p className="text-xs text-[var(--uris-text-secondary)] leading-relaxed">
                          Simulation indicates high probability of mobility collapse if drainage fails during peak monsoon. Proactive intervention recommended.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-4 border-t border-[var(--uris-border)] bg-[var(--uris-bg-muted)] flex justify-end gap-3">
                  <button onClick={() => setShowSimulator(false)} className="px-4 py-2 text-sm font-semibold text-[var(--uris-text-muted)] hover:text-[var(--uris-text-primary)] transition-colors">Close</button>
                  {simResult && (
                    <button onClick={() => setSimResult(null)} className="px-4 py-2 rounded-[var(--uris-radius-md)] bg-[var(--uris-bg-header)] text-white text-sm font-semibold hover:opacity-90 transition-opacity">Reset</button>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
    </div>
  );
}
