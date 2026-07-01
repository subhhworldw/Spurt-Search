export interface SearchResult {
  id: string;
  title: string;
  description: string;
  database: string;
  category: string;
  url: string;
  
  // Tier 2 & 4 Rich Metadata Fields
  organism?: string;
  sequenceLength?: number;
  moleculeType?: string; // DNA, RNA, Protein
  reviewed?: boolean;    // UniProt
  geneName?: string;     // UniProt / NCBI
  annotationScore?: number; // UniProt (1-5)
  resolution?: number;   // PDB
  experimentalMethod?: string; // PDB
  chainCount?: number;   // PDB
  releaseDate?: string;
  isCanonical?: boolean;
  sequence?: string;
  keywords?: string[];
  lineage?: string[];
  crossRefs?: { db: string; id: string; url: string }[];
  
  // Multi-db duplicate tracking
  mergedFrom?: SearchResult[];
  
  // Search Relevance Engine
  score?: number;
  ranking_factors?: string[];
}

export interface HistoryItem {
  query: string;
  timestamp: number;
}

export interface ApiStatusMap {
  [dbKey: string]: "ok" | "error" | "loading" | null;
}

export interface SavedCollection {
  id: string;
  name: string;
  items: SearchResult[];
  createdAt: number;
}

export interface SearchFilters {
  ncbiOrganism: string;
  ncbiMinLength: string;
  ncbiMaxLength: string;
  ncbiMoleculeType: string;
  ncbiMinYear: string;
  ncbiMaxYear: string;
  
  uniprotReviewed: "all" | "reviewed" | "unreviewed";
  uniprotOrganism: string;
  uniprotGeneName: string;
  uniprotMinScore: number;
  
  pdbMinResolution: string;
  pdbMaxResolution: string;
  pdbExperimentalMethod: string;
  pdbMinChains: string;
  pdbMaxChains: string;
  pdbMinYear: string;
  pdbMaxYear: string;
}

export interface SearchAnalytics {
  topSearches: { query: string; count: number }[];
  topViews: { id: string; title: string; count: number }[];
}

export interface CacheEntry {
  query: string;
  results: SearchResult[];
  timestamp: number;
}
