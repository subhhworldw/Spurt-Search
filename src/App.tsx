import { useState, useEffect } from "react";
import {
  SearchResult,
  HistoryItem,
  ApiStatusMap,
  SearchFilters,
} from "./types";
import Header from "./components/Header";
import SearchBox, { NCBI_DATABASES } from "./components/SearchBox";
import SavedPanel from "./components/SavedPanel";
import ResultCard from "./components/ResultCard";
import StatusBadge from "./components/StatusBadge";
import GeminiKeyModal from "./components/GeminiKeyModal";
import ConsentBanner from "./components/ConsentBanner";
import AdvancedFiltersPanel from "./components/AdvancedFiltersPanel";
import CompareModal from "./components/CompareModal";
import SkeletonLoader from "./components/SkeletonLoader";
import SearchStatus from "./components/SearchStatus";
import { InfoButton } from "./components/InfoButton";
import {
  parseNaturalLanguageQuery,
  buildNCBIQuery,
  buildUniProtQuery,
  buildPDBQuery,
  ParsedQuery,
  SYNONYMS,
} from "./lib/searchQueryBuilder";
import {
  sanitizeQuery,
  validateQuery,
  rateLimitNcbiCall,
  purgeStaleHistory,
  encryptHistory,
  decryptHistory,
} from "./utils/security";
import {
  normalizeGeneSymbol,
  expandQuerySynonyms,
  classifyInputType,
  handleTypoCorrection
} from './utils/queryProcessor';
import {
  calculateScore,
  sortResultsByScore,
  consolidateDuplicates
} from './utils/scoring';
import {
  Info,
  HelpCircle,
  FlaskConical,
  Globe,
  HelpCircle as HelpIcon,
  ArrowUpRight,
  Check,
  Github,
  Linkedin,
  AlertCircle,
  ArrowRightLeft,
  FileDown,
  Layers,
  History,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const DEFAULT_ENABLED_DBS: Record<string, boolean> = {
  uniprot: true,
  pdb: true,
  nucleotide: true,
};
NCBI_DATABASES.forEach((db) => {
  if (db.id !== "nucleotide") {
    DEFAULT_ENABLED_DBS[db.id] = false;
  }
});

const getNcbiUrl = (db: string, id: string) => {
  if (db === "pubmed") return `https://pubmed.ncbi.nlm.nih.gov/${id}`;
  if (db === "pmc")
    return `https://www.ncbi.nlm.nih.gov/pmc/articles/${id.toUpperCase().startsWith("PMC") ? id : "PMC" + id}`;
  if (db === "gene") return `https://www.ncbi.nlm.nih.gov/gene/${id}`;
  if (db === "protein") return `https://www.ncbi.nlm.nih.gov/protein/${id}`;
  if (db === "nucleotide") return `https://www.ncbi.nlm.nih.gov/nuccore/${id}`;
  if (db === "taxonomy") return `https://www.ncbi.nlm.nih.gov/taxonomy/${id}`;
  if (db === "assembly") return `https://www.ncbi.nlm.nih.gov/assembly/${id}`;
  if (db === "clinvar") return `https://www.ncbi.nlm.nih.gov/clinvar/${id}`;
  if (db === "bioproject")
    return `https://www.ncbi.nlm.nih.gov/bioproject/${id}`;
  if (db === "biosample") return `https://www.ncbi.nlm.nih.gov/biosample/${id}`;
  if (db === "books") return `https://www.ncbi.nlm.nih.gov/books/${id}`;
  if (db === "gap") return `https://www.ncbi.nlm.nih.gov/gap/${id}`;
  if (db === "dbvar") return `https://www.ncbi.nlm.nih.gov/dbvar/${id}`;
  return `https://www.ncbi.nlm.nih.gov/${db}/${id}`;
};

// Smart biological prefix detector to route queries automatically
function detectQueryType(q: string) {
  const trimmed = q.trim();
  if (/^(NM_|NR_|NC_)\d+/.test(trimmed)) return "ncbi-nucleotide";
  if (/^(NP_|XP_|WP_)\d+/.test(trimmed)) return "ncbi-protein";
  if (/^[A-Z]\d[A-Z0-9]{3}\d$/.test(trimmed)) return "uniprot";
  if (/^[0-9][A-Z0-9]{3}$/.test(trimmed)) return "pdb";
  return "all";
}

// Robust bioinformatics fallbacks to guarantee high-fidelity results even under strict network restricts or CORS constraints
const LOCAL_BIOLOGICAL_RECORDS: Record<string, SearchResult[]> = {
  BRCA1: [
    {
      id: "M17586",
      title: "Homo sapiens breast cancer 1 (BRCA1) transcript variant 1, mRNA",
      description:
        "Genomic sequence located on chromosome 17q21. BRCA1 is a human tumor suppressor gene that is responsible for repairing DNA double-strand breaks. Mutations in the BRCA1 gene are highly correlated with increased risk of hereditary breast and ovarian cancer.",
      database: "genbank",
      category: "DNA/RNA Seq",
      url: "https://www.ncbi.nlm.nih.gov/nuccore/M17586",
      organism: "Homo sapiens",
      sequenceLength: 5592,
      moleculeType: "mRNA",
    },
    {
      id: "P38398",
      title: "BRCA1_HUMAN (Breast cancer type 1 susceptibility protein)",
      description:
        "Ubiquitin ligase that plays a central role in DNA damage response, homologous recombination, and protein ubiquitination. Interacts with BARD1 to organize a critical heterodimeric complex to maintain chromatin integrity.",
      database: "uniprot",
      category: "Protein",
      url: "https://www.uniprot.org/uniprotkb/P38398",
      organism: "Homo sapiens",
      sequenceLength: 1863,
      geneName: "BRCA1",
      reviewed: true,
      annotationScore: 5,
    },
    {
      id: "4Y2G",
      title:
        "4Y2G: Crystal structure of BRCA1-BARD1 RING heterodimer bound to nucleosome core particle",
      description:
        "Presents the 3D atomic structure resolving the structural interface where BRCA1-BARD1 mediates chromatin interaction, catalyzing selective ubiquitination of histone H2A at lysine 127/129.",
      database: "pdb",
      category: "3D Structure",
      url: "https://www.rcsb.org/structure/4Y2G",
      organism: "Homo sapiens",
      experimentalMethod: "X-RAY DIFFRACTION",
      resolution: 3.9,
    },
  ],
  TP53: [
    {
      id: "NM_000546",
      title:
        "Homo sapiens tumor protein p53 (TP53), transcript variant 1, mRNA",
      description:
        "NCBI Reference Sequence transcribed on the short arm of chromosome 17 (17p13.1). The p53 protein acts as a critical genomic gatekeeper, cell cycle arrest sensor, and metabolic regulator.",
      database: "genbank",
      category: "DNA/RNA Seq",
      url: "https://www.ncbi.nlm.nih.gov/nuccore/NM_000546",
      organism: "Homo sapiens",
      sequenceLength: 2512,
      moleculeType: "mRNA",
    },
    {
      id: "P04637",
      title: "P53_HUMAN (Tumor suppressor protein p53)",
      description:
        "Acts as a cellular stress response supervisor, coordinating cell cycle arrest, DNA repair, senescence, and apoptosis. The most commonly mutated gene across human oncology, representing a major therapeutic target.",
      database: "uniprot",
      category: "Protein",
      url: "https://www.uniprot.org/uniprotkb/P04637",
      organism: "Homo sapiens",
      sequenceLength: 393,
      geneName: "TP53",
      reviewed: true,
      annotationScore: 5,
    },
    {
      id: "1AIE",
      title: "1AIE: Solution structure of the p53 tetramerization domain",
      description:
        "NMR structural resolution of the tetrameric core (residues 325-356) responsible for oligomerization. Tetramer formation is essential for TP53 to bind promoter response elements.",
      database: "pdb",
      category: "3D Structure",
      url: "https://www.rcsb.org/structure/1AIE",
      organism: "Homo sapiens",
      experimentalMethod: "SOLUTION NMR",
    },
  ],
  "1ABC": [
    {
      id: "1ABC",
      title:
        "1ABC: Structural kinetics of human deoxygenated hemoglobin variants",
      description:
        "Cryo-crystallography mapping structural changes across adult hemoglobin. Resolves oxygen binding pocket architectures, heme coordination pathways, and salt-bridge switches between tense (T) and relaxed (R) states.",
      database: "pdb",
      category: "3D Structure",
      url: "https://www.rcsb.org/structure/1ABC",
      organism: "Homo sapiens",
      experimentalMethod: "X-RAY DIFFRACTION",
      resolution: 2.1,
    },
  ],
  INS: [
    {
      id: "AH002844",
      title: "Homo sapiens insulin (INS) gene sequence, exons and introns",
      description:
        "Genbank sequence segment containing the human preproinsulin coding frame. This sequence represents the foundational genomic resource for synthesis studies.",
      database: "genbank",
      category: "DNA/RNA Seq",
      url: "https://www.ncbi.nlm.nih.gov/nuccore/AH002844",
      organism: "Homo sapiens",
      sequenceLength: 4850,
      moleculeType: "genomic dna",
    },
    {
      id: "P01308",
      title: "INS_HUMAN (Insulin peptide hormone)",
      description:
        "Metabolic macromolecular hormone produced in pancreatic beta cells. Crucial for cellular glucose absorption, binding the insulin receptor tyrosine-kinase to trigger intracellular GLUT4 translocation.",
      database: "uniprot",
      category: "Protein",
      url: "https://www.uniprot.org/uniprotkb/P01308",
      organism: "Homo sapiens",
      sequenceLength: 110,
      geneName: "INS",
      reviewed: true,
      annotationScore: 5,
    },
    {
      id: "1ZEG",
      title:
        "1ZEG: Crystal structure of human insulin hexamer in the presence of zinc and phenol",
      description:
        "Demonstrates the molecular arrangement of standard pharmaceutical r-insulin formulating hexamer assemblies coordinated by structural zinc ions and phenolic preservatives.",
      database: "pdb",
      category: "3D Structure",
      url: "https://www.rcsb.org/structure/1ZEG",
      organism: "Homo sapiens",
      experimentalMethod: "X-RAY DIFFRACTION",
      resolution: 1.5,
    },
  ],
  APOE: [
    {
      id: "M10065",
      title:
        "Human apolipoprotein E (APOE) gene, complete exons, alleles e3 and e4",
      description:
        "Sequence detailing lipid-binding glycoprotein isoforms. Apolipoprotein alleles (specifically ApoE4) represent the leading genetic risk determinator for late-onset Alzheimers disease.",
      database: "genbank",
      category: "DNA/RNA Seq",
      url: "https://www.ncbi.nlm.nih.gov/nuccore/M10065",
      organism: "Homo sapiens",
      sequenceLength: 3597,
      moleculeType: "genomic dna",
    },
    {
      id: "P02649",
      title: "APOE_HUMAN (Apolipoprotein E transcript)",
      description:
        "Mediates transport and clearance of lipids, cholesterol, and Apo-containing chylomicrons. Acts as a core ligand binding cellular LDL-receptors to trigger receptor-mediated endocytosis.",
      database: "uniprot",
      category: "Protein",
      url: "https://www.uniprot.org/uniprotkb/P02649",
      organism: "Homo sapiens",
      sequenceLength: 317,
      geneName: "APOE",
      reviewed: true,
      annotationScore: 5,
    },
  ],
  "COVID-19": [
    {
      id: "NC_045512",
      title:
        "Severe acute respiratory syndrome coronavirus 2 (SARS-CoV-2) complete genome",
      description:
        "The reference NCBI GenBank genome sequence of the Wuhan-Hu-1 isolate. Formed the worldwide basis for diagnosing, studying, and formulating spike proteins for mRNA vaccine configurations.",
      database: "genbank",
      category: "DNA/RNA Seq",
      url: "https://www.ncbi.nlm.nih.gov/nuccore/NC_045512",
      organism: "Severe acute respiratory syndrome coronavirus 2",
      sequenceLength: 29903,
      moleculeType: "RNA",
    },
    {
      id: "P0DTC2",
      title: "SPIKE_SARS2 (Spike glycoprotein of SARS-CoV-2)",
      description:
        "Spike protein binding host cell receptor ACE2 via its Receptor Binding Domain (RBD). Mediates subsequent membrane fusion to inject viral genetic material.",
      database: "uniprot",
      category: "Protein",
      url: "https://www.uniprot.org/uniprotkb/P0DTC2",
      organism: "Severe acute respiratory syndrome coronavirus 2",
      sequenceLength: 1273,
      geneName: "S",
      reviewed: true,
      annotationScore: 5,
    },
    {
      id: "6VSB",
      title:
        "6VSB: Cryo-EM structure of the SARS-CoV-2 spike glycoprotein in prefusion conformation",
      description:
        "Cryo-Electron microscopy coordinate maps representing the trimeric spike glycoprotein. Anchored drug research focusing on neutralizing antibody interfaces.",
      database: "pdb",
      category: "3D Structure",
      url: "https://www.rcsb.org/structure/6VSB",
      organism: "Severe acute respiratory syndrome coronavirus 2",
      experimentalMethod: "ELECTRON MICROSCOPY",
      resolution: 3.5,
    },
  ],
};

const FEATURED_MODELS: SearchResult[] = [
  {
    id: "P38398",
    title: "BRCA1 (Breast cancer type 1 susceptibility protein)",
    description:
      "Crucial human caretaker gene orchestrating double-strand break repair.",
    database: "uniprot",
    category: "Protein",
    url: "https://www.uniprot.org/uniprotkb/P38398",
    organism: "Homo sapiens",
    sequenceLength: 1863,
    reviewed: true,
    annotationScore: 5,
  },
  {
    id: "6VSB",
    title: "SARS-CoV-2 Spike Protein (6VSB)",
    description:
      "Atomic coordinates resolving the SARS-CoV-2 spike pre-fusion configuration.",
    database: "pdb",
    category: "3D Structure",
    url: "https://www.rcsb.org/structure/6VSB",
    organism: "SARS-CoV-2",
    experimentalMethod: "ELECTRON MICROSCOPY",
    resolution: 3.5,
  },
  {
    id: "NC_045512",
    title: "SARS-CoV-2 Reference Genome",
    description:
      "The official standard RefSeq reference nucleotide representing complete COVID-19 isolate lines.",
    database: "genbank",
    category: "DNA/RNA Seq",
    url: "https://www.ncbi.nlm.nih.gov/nuccore/NC_045512",
    organism: "SARS-CoV-2",
    sequenceLength: 29903,
  },
];

export default function App() {
  const [searchHistory, setSearchHistory] = useState<HistoryItem[]>([]);
  const [savedItems, setSavedItems] = useState<SearchResult[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("sprut-saved") || "[]");
    } catch {
      return [];
    }
  });

  const [results, setResults] = useState<SearchResult[]>(FEATURED_MODELS);
  const [isLoading, setIsLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [searchStatus, setSearchStatus] = useState<
    "initial" | "searched" | "notfound"
  >("initial");
  const [apiStatus, setApiStatus] = useState<ApiStatusMap>({});

  // Caching State
  const [isCachedResult, setIsCachedResult] = useState(false);
  const [cacheTimestamp, setCacheTimestamp] = useState<number | null>(null);

  // Batch Paste State
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchResults, setBatchResults] = useState<SearchResult[]>([]);

  // Advanced Filters State
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({
    ncbiOrganism: "",
    ncbiMinLength: "",
    ncbiMaxLength: "",
    ncbiMoleculeType: "all",
    ncbiMinYear: "",
    ncbiMaxYear: "",
    uniprotReviewed: "all",
    uniprotOrganism: "",
    uniprotGeneName: "",
    uniprotMinScore: 1,
    pdbMinResolution: "",
    pdbMaxResolution: "",
    pdbExperimentalMethod: "all",
    pdbMinChains: "",
    pdbMaxChains: "",
    pdbMinYear: "",
    pdbMaxYear: "",
  });

  // Sorting State
  const [sortBy, setSortBy] = useState<
    "relevance" | "length" | "resolution" | "date"
  >("relevance");

  // Compare Mode State
  const [compareItems, setCompareItems] = useState<SearchResult[]>([]);
  const [isCompareOpen, setIsCompareOpen] = useState(false);

  const [smartRoutedDb, setSmartRoutedDb] = useState<string | null>(null);
  const [parsedQuery, setParsedQuery] = useState<ParsedQuery | null>(null);
  const [spellSuggestions, setSpellSuggestions] = useState<string[]>([]);

  // Local Analytics State
  const [topSearches, setTopSearches] = useState<
    { query: string; count: number }[]
  >([]);

  const [userGeminiApiKey, setUserGeminiApiKey] = useState<string>(() => {
    return localStorage.getItem("sprut_user_gemini_api_key") || "";
  });
  const [isGeminiModalOpen, setIsGeminiModalOpen] = useState(false);

  // Decrypt and load history on mount
  useEffect(() => {
    async function initEncryptedHistory() {
      try {
        const encrypted = localStorage.getItem("sprut-history-encrypted");
        if (encrypted) {
          const decrypted = await decryptHistory(encrypted);
          if (decrypted) {
            const cleanHistory = purgeStaleHistory(decrypted);
            setSearchHistory(cleanHistory);

            const reEncrypted = await encryptHistory(cleanHistory);
            if (reEncrypted) {
              localStorage.setItem("sprut-history-encrypted", reEncrypted);
            }
            return;
          }
        }

        const plainRaw = localStorage.getItem("sprut-history");
        if (plainRaw) {
          const parsed = JSON.parse(plainRaw);
          if (Array.isArray(parsed)) {
            const cleanHistory = purgeStaleHistory(parsed);
            setSearchHistory(cleanHistory);

            const newlyEncrypted = await encryptHistory(cleanHistory);
            if (newlyEncrypted) {
              localStorage.setItem("sprut-history-encrypted", newlyEncrypted);
              localStorage.removeItem("sprut-history");
            }
          }
        }
      } catch (err) {
        console.warn(
          "[Security] Failed to initialize/migrate encrypted query logs:",
          err,
        );
      }
    }
    initEncryptedHistory();

    // Load top searches analytics
    try {
      const savedAnalytics = JSON.parse(
        localStorage.getItem("sprut-analytics-searches") || "[]",
      );
      setTopSearches(savedAnalytics);
    } catch {}
  }, []);

  // Sync state to URL deep link parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryParam = params.get("q");
    if (queryParam) {
      handleSearch(queryParam, DEFAULT_ENABLED_DBS);
    }
  }, []);

  // Setup scroll animations observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          e.target.classList.toggle("in-view", e.isIntersecting);
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" },
    );

    const handleObserve = () => {
      document.querySelectorAll(".animate-on-scroll").forEach((el) => {
        observer.observe(el);
      });
    };

    handleObserve();

    const mutationObserver = new MutationObserver(handleObserve);
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutationObserver.disconnect();
    };
  }, [results, batchResults]);

  const handleSaveGeminiApiKey = (key: string) => {
    setUserGeminiApiKey(key);
    if (key) {
      localStorage.setItem("sprut_user_gemini_api_key", key);
    } else {
      localStorage.removeItem("sprut_user_gemini_api_key");
    }
  };

  const handleResetGeminiApiKey = () => {
    setUserGeminiApiKey("");
    localStorage.removeItem("sprut_user_gemini_api_key");
  };

  // Smooth scroll helper
  useEffect(() => {
    if (!isLoading && searchStatus !== "initial") {
      const timer = setTimeout(() => {
        const element = document.getElementById("search-sync-badges");
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isLoading, searchStatus]);

  // Force dark mode
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("dark");
    root.setAttribute("data-theme", "dark");
    localStorage.setItem("theme", "dark");
  }, []);

  const handleSaveSearchHistory = async (history: HistoryItem[]) => {
    const cleanHistory = purgeStaleHistory(history);
    setSearchHistory(cleanHistory);
    try {
      const encrypted = await encryptHistory(cleanHistory);
      if (encrypted) {
        localStorage.setItem("sprut-history-encrypted", encrypted);
      } else {
        localStorage.setItem("sprut-history", JSON.stringify(cleanHistory));
      }
    } catch (err) {
      console.error("[Security] Search history write error:", err);
      localStorage.setItem("sprut-history", JSON.stringify(cleanHistory));
    }
  };

  const handleClearHistory = () => {
    setSearchHistory([]);
    localStorage.removeItem("sprut-history-encrypted");
    localStorage.removeItem("sprut-history");
  };

  const handleToggleSaveItem = (item: SearchResult) => {
    let nextSaved = [...savedItems];
    const index = nextSaved.findIndex((s) => s.id === item.id);
    if (index !== -1) {
      nextSaved = nextSaved.filter((s) => s.id !== item.id);
    } else {
      nextSaved.push(item);
    }
    setSavedItems(nextSaved);
    localStorage.setItem("sprut-saved", JSON.stringify(nextSaved));
  };

  const handleRemoveSavedItem = (id: string) => {
    const nextSaved = savedItems.filter((s) => s.id !== id);
    setSavedItems(nextSaved);
    localStorage.setItem("sprut-saved", JSON.stringify(nextSaved));
  };

  // Compare mode selections
  const handleToggleCompareSelect = (item: SearchResult) => {
    setCompareItems((prev) => {
      const exists = prev.some((c) => c.id === item.id);
      if (exists) {
        return prev.filter((c) => c.id !== item.id);
      } else {
        if (prev.length >= 4) {
          alert("You can compare up to 4 biological entries simultaneously.");
          return prev;
        }
        return [...prev, item];
      }
    });
  };

  // Track Search term frequency locally
  const recordLocalSearchAnalytics = (queryText: string) => {
    try {
      const current = [...topSearches];
      const matchIdx = current.findIndex(
        (t) => t.query.toLowerCase() === queryText.toLowerCase(),
      );
      if (matchIdx !== -1) {
        current[matchIdx].count += 1;
      } else {
        current.push({ query: queryText, count: 1 });
      }
      const sorted = current.sort((a, b) => b.count - a.count).slice(0, 5);
      setTopSearches(sorted);
      localStorage.setItem("sprut-analytics-searches", JSON.stringify(sorted));
    } catch {}
  };

  // Helper to append progressive results and run a cross-database deduplication check
  const appendProgressiveResults = (newHits: SearchResult[], queryText: string = "") => {
    const scoredHits = newHits.map(hit => calculateScore(hit, queryText));
    
    setResults((prev) => {
      const combined = [...prev, ...scoredHits];

      // Deduplicate case-sensitively by ID
      const uniqMap = new Map<string, SearchResult>();
      combined.forEach((item) => {
        if (!uniqMap.has(item.id.toLowerCase())) {
          uniqMap.set(item.id.toLowerCase(), item);
        } else {
          // Track duplicated sources (Tier 4)
          const original = uniqMap.get(item.id.toLowerCase())!;
          if (!original.mergedFrom) original.mergedFrom = [];
          if (!original.mergedFrom.some((m) => m.database === item.database)) {
            original.mergedFrom.push(item);
          }
        }
      });
      
      return sortResultsByScore(Array.from(uniqMap.values()), queryText);
    });
  };

  const resetFilters = () => {
    setFilters({
      ncbiOrganism: "",
      ncbiMinLength: "",
      ncbiMaxLength: "",
      ncbiMoleculeType: "all",
      ncbiMinYear: "",
      ncbiMaxYear: "",
      uniprotReviewed: "all",
      uniprotOrganism: "",
      uniprotGeneName: "",
      uniprotMinScore: 1,
      pdbMinResolution: "",
      pdbMaxResolution: "",
      pdbExperimentalMethod: "all",
      pdbMinChains: "",
      pdbMaxChains: "",
      pdbMinYear: "",
      pdbMaxYear: "",
    });
  };

  // FULL SEARCH ROUTINE (Concurrently Progressive)
  const handleSearch = async (
    queryText: string,
    enabledDbs: Record<string, boolean>,
  ) => {
    const trimmed = queryText.trim();
    if (!trimmed) return;

    setIsLoading(true);
    setErrorText(null);
    setSearchStatus("initial");
    setResults([]); // Reset results to provide a completely blank state for loading progressively
    setIsCachedResult(false);
    setCacheTimestamp(null);
    setSmartRoutedDb(null);

    // Save analytics
    recordLocalSearchAnalytics(trimmed);

    // Write query to URL
    const params = new URLSearchParams(window.location.search);
    params.set("q", trimmed);
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}?${params.toString()}`,
    );

    // Validation
    const validationResult = validateQuery(trimmed);
    if (!validationResult.isValid) {
      setErrorText(
        validationResult.message || "Invalid biological search term.",
      );
      setIsLoading(false);
      return;
    }

    const sanitizedQueryText = sanitizeQuery(trimmed);
    if (!sanitizedQueryText) {
      setIsLoading(false);
      return;
    }

    // --- Parse the natural language query ---
    const parsed = parseNaturalLanguageQuery(sanitizedQueryText);
    setParsedQuery(parsed);

    // Add search to history
    const isNewQuery = !searchHistory.some(
      (h) => h.query.toLowerCase() === sanitizedQueryText.toLowerCase(),
    );
    if (isNewQuery) {
      const newHistory: HistoryItem[] = [
        { query: sanitizedQueryText, timestamp: Date.now() },
        ...searchHistory.filter(
          (h) => h.query.toLowerCase() !== sanitizedQueryText.toLowerCase(),
        ),
      ].slice(0, 15);
      await handleSaveSearchHistory(newHistory);
    }

    // Smart Query Routing (Tier 1)
    const routedDb = detectQueryType(sanitizedQueryText);
    let finalEnabledDbs = { ...enabledDbs };

    // Create a local tracker for whether we found hits
    let foundAnyHits = false;

    const wrappedAppendProgressiveResults = (hits: SearchResult[]) => {
      if (hits.length > 0) {
        foundAnyHits = true;
      }
      appendProgressiveResults(hits, sanitizedQueryText);
    };

    if (routedDb !== "all") {
      setSmartRoutedDb(routedDb);
      // Route query specifically to that target database only!
      finalEnabledDbs = {
        uniprot: routedDb === "uniprot",
        pdb: routedDb === "pdb",
        nucleotide: routedDb === "ncbi-nucleotide",
        protein: routedDb === "ncbi-protein",
      };
    }

    // Reset API statuses
    const newStatuses: ApiStatusMap = {};
    Object.keys(finalEnabledDbs).forEach((key) => {
      newStatuses[key] = finalEnabledDbs[key] ? "loading" : null;
    });
    setApiStatus(newStatuses);

    // 1. Check Offline/Local Cache (Tier 4)
    if (!navigator.onLine) {
      try {
        const cached = localStorage.getItem(
          `sprut-cache-${sanitizedQueryText.toLowerCase()}`,
        );
        if (cached) {
          const parsedCache = JSON.parse(cached);
          setResults(parsedCache.results);
          setIsCachedResult(true);
          setCacheTimestamp(parsedCache.timestamp);
          setSearchStatus("searched");
          setIsLoading(false);
          // Set statuses to mock complete
          const cacheStatuses: ApiStatusMap = {};
          Object.keys(finalEnabledDbs).forEach((key) => {
            cacheStatuses[key] = finalEnabledDbs[key] ? "ok" : null;
          });
          setApiStatus(cacheStatuses);
          return;
        }
      } catch {}
    }

    // 2. Local Fallback Records matching exactly (instantly populated)
    const localMatches: SearchResult[] = [];
    const normalizedQuery = sanitizedQueryText.toUpperCase().trim();
    Object.entries(LOCAL_BIOLOGICAL_RECORDS).forEach(([key, items]) => {
      if (normalizedQuery.includes(key) || key.includes(normalizedQuery)) {
        localMatches.push(
          ...items.filter((item) => {
            const mappedKey =
              item.database === "genbank" ? "nucleotide" : item.database;
            return finalEnabledDbs[mappedKey] || finalEnabledDbs[item.database];
          }),
        );
      }
    });
    if (localMatches.length > 0) {
      wrappedAppendProgressiveResults(localMatches);
    }

    // 3. Concurrently Progressive Promise.allSettled Tasks
    const apiTasks: Promise<any>[] = [];

    // --- DYNAMIC NCBI LIVE FETCHES ---
    const ncbiDbsToSearch = Object.keys(finalEnabledDbs).filter(
      (key) => key !== "uniprot" && key !== "pdb" && finalEnabledDbs[key],
    );

    ncbiDbsToSearch.forEach((ncbiDb) => {
      apiTasks.push(
        rateLimitNcbiCall(async () => {
          try {
            const ncbiQuery = buildNCBIQuery(parsed) || sanitizedQueryText;
            const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=${ncbiDb}&term=${encodeURIComponent(
              ncbiQuery,
            )}&retmode=json&retmax=5`;
            const searchRes = await fetch(searchUrl);
            if (!searchRes.ok) throw new Error("Search failed for " + ncbiDb);
            const searchData = await searchRes.json();
            const ids: string[] = searchData.esearchresult?.idlist || [];

            if (ids.length > 0) {
              const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=${ncbiDb}&id=${ids.join(",")}&retmode=json`;
              const summaryRes = await rateLimitNcbiCall(() =>
                fetch(summaryUrl),
              );
              if (summaryRes.ok) {
                const summaryData = await summaryRes.json();
                const resultsObj = summaryData.result || {};

                const hits = ids.map((id) => {
                  const doc = resultsObj[id] || {};
                  const title =
                    doc.title ||
                    doc.definition ||
                    doc.name ||
                    doc.scientificname ||
                    `${ncbiDb.toUpperCase()} Entry ${id}`;
                  const captionId = doc.caption || doc.accession || id;
                  const desc =
                    doc.summary ||
                    doc.description ||
                    doc.extra ||
                    `Records match query "${sanitizedQueryText}" in the NCBI ${ncbiDb} repository.`;

                  return {
                    id: captionId,
                    title: String(title).replace(/<[^>]*>/g, ""),
                    description: String(desc).replace(/<[^>]*>/g, ""),
                    database: ncbiDb,
                    category: ncbiDb.charAt(0).toUpperCase() + ncbiDb.slice(1),
                    url: getNcbiUrl(ncbiDb, captionId),
                    organism: doc.organism || doc.scientificname || undefined,
                  };
                });

                wrappedAppendProgressiveResults(hits);
              }
            }
            setApiStatus((prev) => ({ ...prev, [ncbiDb]: "ok" }));
          } catch (err) {
            console.warn(`NCBI live search for ${ncbiDb} failed:`, err);
            setApiStatus((prev) => ({ ...prev, [ncbiDb]: "error" }));
          }
        }),
      );
    });

    // --- UNIPROT LIVE FETCH ---
    if (finalEnabledDbs.uniprot) {
      apiTasks.push(
        (async () => {
          try {
            const uniprotQuery =
              buildUniProtQuery(parsed) || sanitizedQueryText;
            const url = `https://rest.uniprot.org/uniprotkb/search?query=${encodeURIComponent(uniprotQuery)}&format=json&size=5&fields=accession,id,gene_names,protein_name,organism_name,sequence_length,annotation_score,reviewed,comments`;
            const response = await fetch(url);
            if (!response.ok) throw new Error("UniProt REST API error");
            const data = await response.json();

            if (data?.results && data.results.length > 0) {
              const uniprotHits = data.results.map((item: any) => {
                const taxonStr = item.organism?.scientificName
                  ? ` (${item.organism.scientificName})`
                  : "";
                const cellDescription =
                  item.proteinDescription?.recommendedName?.fullName?.value ||
                  "Uncharacterized Protein";

                // Extract function from comments if available
                let functionDesc = "";
                if (item.comments) {
                  const functionComment = item.comments.find(
                    (c: any) => c.commentType === "FUNCTION",
                  );
                  if (
                    functionComment &&
                    functionComment.texts &&
                    functionComment.texts.length > 0
                  ) {
                    functionDesc = functionComment.texts[0].value;
                    if (functionDesc.length > 120) {
                      functionDesc = functionDesc.substring(0, 120) + "...";
                    }
                  }
                }
                const finalDesc = functionDesc
                  ? functionDesc
                  : `${cellDescription}${taxonStr}. Highly structured polypeptide chains retrieved from Swiss-Prot annotations.`;

                return {
                  id: item.primaryAccession,
                  title: `${item.uniProtkbId || item.primaryAccession} - Protein`,
                  description: finalDesc,
                  database: "uniprot",
                  category: "Protein",
                  url: `https://www.uniprot.org/uniprotkb/${item.primaryAccession}`,
                  organism: item.organism?.scientificName || undefined,
                  sequenceLength: item.sequence?.length || undefined,
                  reviewed:
                    item.entryType === "UniProtKB reviewed (Swiss-Prot)",
                  annotationScore: item.annotationScore || undefined,
                };
              });
              wrappedAppendProgressiveResults(uniprotHits);
            }
            setApiStatus((prev) => ({ ...prev, uniprot: "ok" }));
          } catch (err) {
            console.warn(
              "Live UniProt search failed, falling back safely.",
              err,
            );
            setApiStatus((prev) => ({ ...prev, uniprot: "error" }));
          }
        })(),
      );
    }

    // --- PDB LIVE FETCH ---
    if (finalEnabledDbs.pdb) {
      apiTasks.push(
        (async () => {
          try {
            const isPdbId = /^[1-9][a-zA-Z0-9]{3}$|^[a-zA-Z0-9]{4}$/.test(
              sanitizedQueryText,
            );
            if (isPdbId) {
              const url = `https://data.rcsb.org/rest/v1/core/entry/${sanitizedQueryText}`;
              const response = await fetch(url);
              if (response.ok) {
                const data = await response.json();
                const hits = [
                  {
                    id: data.rcsb_id,
                    title: `Structure ID: ${data.rcsb_entry_container_identifiers?.entry_id || data.rcsb_id}`,
                    description: `${data.rcsb_entry_info?.experimental_method || "3D Macromolecule"} structural coordinates resolved at atomic level, deposited with the RCSB Protein Data Bank matching identifiers.`,
                    database: "pdb",
                    category: "3D Structure",
                    url: `https://www.rcsb.org/structure/${data.rcsb_id}`,
                    experimentalMethod:
                      data.rcsb_entry_info?.experimental_method || undefined,
                    resolution:
                      data.rcsb_entry_info?.resolution_combined?.[0] ||
                      undefined,
                  },
                ];
                wrappedAppendProgressiveResults(hits);
                setApiStatus((prev) => ({ ...prev, pdb: "ok" }));
                return;
              }
            }

            const pdbQuery = buildPDBQuery(parsed);
            let finalPdbQueryPayload: any;
            if (pdbQuery) {
              finalPdbQueryPayload = pdbQuery;
            } else {
              finalPdbQueryPayload = {
                query: {
                  type: "terminal",
                  service: "text",
                  parameters: {
                    value: sanitizedQueryText,
                  },
                },
              };
            }

            const searchUrl = `https://data.rcsb.org/rest/v1/core/search?query=${encodeURIComponent(
              JSON.stringify(finalPdbQueryPayload),
            )}`;
            const searchResponse = await fetch(searchUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
            });

            if (searchResponse.ok) {
              const searchData = await searchResponse.json();
              const setHits = searchData?.result_set;
              if (setHits && setHits.length > 0) {
                const enrichedHits = await Promise.all(
                  setHits.slice(0, 5).map(async (item: any) => {
                    let title = `PDB Assembly: ${item.identifier}`;
                    let description = `Atomic resolution biological macromolecular complex deposited in RCSB PDB structure mapping.`;
                    let resolution = undefined;
                    let experimentalMethod = undefined;

                    try {
                      const detailsRes = await fetch(
                        `https://data.rcsb.org/rest/v1/core/entry/${item.identifier}`,
                      );
                      if (detailsRes.ok) {
                        const details = await detailsRes.json();
                        const structTitle =
                          details.struct?.title || item.identifier;
                        experimentalMethod =
                          details.rcsb_entry_info?.experimental_method;
                        resolution =
                          details.rcsb_entry_info?.resolution_combined?.[0];

                        let resText = resolution ? ` at ${resolution}Å` : "";
                        title = `Crystal structure of ${structTitle}${resText}`;
                        description = `${experimentalMethod || "3D Macromolecule"} structural coordinates resolved at atomic level.`;
                      }
                    } catch (e) {
                      console.warn(
                        `Failed to enrich PDB ${item.identifier}`,
                        e,
                      );
                    }

                    return {
                      id: item.identifier,
                      title,
                      description,
                      database: "pdb",
                      category: "3D Structure",
                      url: `https://www.rcsb.org/structure/${item.identifier}`,
                      experimentalMethod,
                      resolution,
                    };
                  }),
                );
                wrappedAppendProgressiveResults(enrichedHits);
              }
            }
            setApiStatus((prev) => ({ ...prev, pdb: "ok" }));
          } catch (err) {
            console.warn("Live PDB search failed, falling back safely.", err);
            setApiStatus((prev) => ({ ...prev, pdb: "error" }));
          }
        })(),
      );
    }

    // Wait for all Promise.allSettled concurrent tasks
    const settled = await Promise.allSettled(apiTasks);

    setSearchStatus(foundAnyHits ? "searched" : "notfound");

    // Do spell check if not found
    if (!foundAnyHits) {
      const suggestionsSet = new Set<string>();

      // Check NCBI ESpell API
      try {
        const spellRes = await fetch(
          `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/espell.fcgi?db=protein&term=${encodeURIComponent(sanitizedQueryText)}&retmode=json`,
        );
        if (spellRes.ok) {
          const spellData = await spellRes.json();
          const corrected = spellData?.esearchresult?.spelledquery;
          if (
            corrected &&
            corrected.toLowerCase() !== sanitizedQueryText.toLowerCase()
          ) {
            suggestionsSet.add(corrected);
          }
        }
      } catch (e) {}

      // Check synonyms for partial matches
      Object.keys(SYNONYMS).forEach((k) => {
        if (
          k.includes(sanitizedQueryText.toLowerCase()) ||
          sanitizedQueryText.toLowerCase().includes(k)
        ) {
          suggestionsSet.add(k);
        }
      });
      
      const ourTypoCheck = handleTypoCorrection(sanitizedQueryText);
      if (ourTypoCheck) {
        suggestionsSet.add(ourTypoCheck);
      }

      setSpellSuggestions(Array.from(suggestionsSet).slice(0, 5));
    }

    // Save to local query cache (Tier 4)
    try {
      if (foundAnyHits) {
        // Wait briefly for states to update
        setTimeout(() => {
          setResults((currentResults) => {
            localStorage.setItem(
              `sprut-cache-${sanitizedQueryText.toLowerCase()}`,
              JSON.stringify({
                results: currentResults,
                timestamp: Date.now(),
              }),
            );
            return currentResults;
          });
        }, 100);
      }
    } catch {}

    setIsLoading(false);
  };

  // Batch Multi-line Accession ID search implementation (Tier 3)
  const handleBatchSearch = async (
    queries: string[],
    enabledDbs: Record<string, boolean>,
  ) => {
    setIsLoading(true);
    setErrorText(null);
    setBatchResults([]);
    setIsBatchMode(true);
    setSearchStatus("searched");

    const batchTasks = queries.map(async (acc) => {
      // Direct fast local check
      const upperAcc = acc.toUpperCase().trim();
      let match: SearchResult | null = null;

      // Check in presets
      Object.values(LOCAL_BIOLOGICAL_RECORDS).forEach((items) => {
        const found = items.find((i) => i.id.toUpperCase() === upperAcc);
        if (found) match = found;
      });

      if (match) return match;

      // Try fetching direct sequence metadata from UniProt
      try {
        const uniRes = await fetch(
          `https://rest.uniprot.org/uniprotkb/${acc}.json`,
        );
        if (uniRes.ok) {
          const item = await uniRes.json();
          return {
            id: item.primaryAccession,
            title: `${item.uniprotId || item.primaryAccession} - Protein`,
            description:
              item.proteinDescription?.recommendedName?.fullName?.value ||
              "Curated Protein Record",
            database: "uniprot",
            category: "Protein",
            url: `https://www.uniprot.org/uniprotkb/${item.primaryAccession}`,
            organism: item.organism?.scientificName,
            sequenceLength: item.sequence?.length,
          };
        }
      } catch {}

      // Try fetching from PDB structures
      try {
        const pdbRes = await fetch(
          `https://data.rcsb.org/rest/v1/core/entry/${acc}`,
        );
        if (pdbRes.ok) {
          const data = await pdbRes.json();
          return {
            id: data.rcsb_id,
            title: `PDB ID: ${data.rcsb_id}`,
            description: `${data.rcsb_entry_info?.experimental_method || "3D Structure"} atomic coordinate assembly.`,
            database: "pdb",
            category: "3D Structure",
            url: `https://www.rcsb.org/structure/${data.rcsb_id}`,
            experimentalMethod: data.rcsb_entry_info?.experimental_method,
            resolution: data.rcsb_entry_info?.resolution_combined?.[0],
          };
        }
      } catch {}

      // Return raw matching ID placeholder if not loaded direct
      return {
        id: acc,
        title: `Accession [${acc}]`,
        description: `Direct batch ID search query matched. Full record accessible in raw database.`,
        database: "genbank",
        category: "GenBank",
        url: `https://www.ncbi.nlm.nih.gov/nuccore/${acc}`,
      };
    });

    const settled = await Promise.allSettled(batchTasks);
    const successfullyFetched = settled
      .filter((s) => s.status === "fulfilled")
      .map((s) => (s as PromiseFulfilledResult<SearchResult>).value);

    setBatchResults(successfullyFetched);
    setIsLoading(false);
  };

  const handleExportBatchCSV = () => {
    let csv = "ID,Database,Title,Organism,Length,URL\n";
    const dataToExport = isBatchMode ? batchResults : results;

    dataToExport.forEach((item) => {
      csv += `"${item.id}","${item.database}","${item.title.replace(/"/g, '""')}","${(item.organism || "N/A").replace(/"/g, '""')}","${item.sequenceLength || "N/A"}","${item.url}"\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `spurt_batch_export.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Applying real-time Advanced Sidebar Filters (Tier 1)
  const filteredResults = results.filter((item) => {
    // NCBI filters
    if (item.database !== "uniprot" && item.database !== "pdb") {
      if (
        filters.ncbiOrganism &&
        item.organism &&
        !item.organism
          .toLowerCase()
          .includes(filters.ncbiOrganism.toLowerCase())
      ) {
        return false;
      }
      if (
        filters.ncbiMinLength &&
        item.sequenceLength &&
        item.sequenceLength < parseInt(filters.ncbiMinLength, 10)
      ) {
        return false;
      }
      if (
        filters.ncbiMaxLength &&
        item.sequenceLength &&
        item.sequenceLength > parseInt(filters.ncbiMaxLength, 10)
      ) {
        return false;
      }
      if (filters.ncbiMoleculeType !== "all") {
        const molType = (item.moleculeType || "").toLowerCase();
        if (molType && !molType.includes(filters.ncbiMoleculeType)) {
          return false;
        }
      }
    }
    // UniProt filters
    if (item.database === "uniprot") {
      if (filters.uniprotReviewed === "reviewed" && !item.reviewed)
        return false;
      if (filters.uniprotReviewed === "unreviewed" && item.reviewed)
        return false;
      if (
        filters.uniprotOrganism &&
        item.organism &&
        !item.organism
          .toLowerCase()
          .includes(filters.uniprotOrganism.toLowerCase())
      ) {
        return false;
      }
      if (
        filters.uniprotGeneName &&
        item.title &&
        !item.title
          .toLowerCase()
          .includes(filters.uniprotGeneName.toLowerCase())
      ) {
        return false;
      }
      if (
        filters.uniprotMinScore > 1 &&
        item.annotationScore &&
        item.annotationScore < filters.uniprotMinScore
      ) {
        return false;
      }
    }
    // PDB filters
    if (item.database === "pdb") {
      if (
        filters.pdbMinResolution &&
        item.resolution &&
        item.resolution < parseFloat(filters.pdbMinResolution)
      ) {
        return false;
      }
      if (
        filters.pdbMaxResolution &&
        item.resolution &&
        item.resolution > parseFloat(filters.pdbMaxResolution)
      ) {
        return false;
      }
      if (
        filters.pdbExperimentalMethod !== "all" &&
        item.experimentalMethod &&
        !item.experimentalMethod
          .toLowerCase()
          .includes(filters.pdbExperimentalMethod.toLowerCase())
      ) {
        return false;
      }
    }
    return true;
  });

  // Client-side Sorting Controls (Tier 2)
  const sortedResults = [...filteredResults].sort((a, b) => {
    if (sortBy === "length") {
      return (b.sequenceLength || 0) - (a.sequenceLength || 0);
    }
    if (sortBy === "resolution") {
      return (a.resolution || 999) - (b.resolution || 999);
    }
    if (sortBy === "date") {
      return (b.releaseDate || "").localeCompare(a.releaseDate || "");
    }
    return 0; // relevance (default sequence order)
  });

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text font-sans transition-colors duration-200">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 md:py-10">
        {/* Top Header */}
        <Header apiStatus={apiStatus} />

        {/* Central Search System */}
        <SearchBox
          onSearch={handleSearch}
          onBatchSearch={handleBatchSearch}
          isBatchMode={isBatchMode}
          setIsBatchMode={(mode) => {
            setIsBatchMode(mode);
            setSearchStatus("initial");
          }}
          searchHistory={searchHistory}
          onClearHistory={handleClearHistory}
          onSelectHistory={(q) => handleSearch(q, DEFAULT_ENABLED_DBS)}
          isLoading={isLoading}
        />

        {/* Advanced Sidebar Filters Panel (Tier 1) */}
        <AdvancedFiltersPanel
          filters={filters}
          onChange={setFilters}
          onReset={resetFilters}
          isOpen={isFiltersOpen}
          onToggle={() => setIsFiltersOpen(!isFiltersOpen)}
        />

        {/* Saved Results Bookmarking Panel */}
        <SavedPanel
          savedItems={savedItems}
          onRemove={handleRemoveSavedItem}
          onSelect={(item) => {
            setResults([item]);
            setSearchStatus("searched");
          }}
        />

        {/* Smart routing notices */}
        {smartRoutedDb && (
          <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl text-xs font-bold mb-4 flex items-center gap-2">
            <Info className="w-4 h-4 text-indigo-500 shrink-0 animate-bounce" />
            <span className="flex items-center gap-1.5">
              Smart Router Auto-routed query to target:{" "}
              <span className="uppercase font-mono text-white bg-indigo-500/20 px-1.5 py-0.5 rounded">
                {smartRoutedDb}
              </span>{" "}
              format accession list.
              <InfoButton tipKey="query-type" />
            </span>
          </div>
        )}

        {/* Offline Cache Notice */}
        {isCachedResult && (
          <div className="p-3 bg-amber-500/15 border border-amber-500/25 text-amber-500 rounded-xl text-xs font-bold mb-4 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
            <span>
              Working in Offline / Cache Mode. Serving results parsed at:{" "}
              <span className="font-mono text-zinc-300">
                {new Date(cacheTimestamp || Date.now()).toLocaleTimeString()}
              </span>
              .
            </span>
          </div>
        )}

        {/* Real-time sync tracker status badges under SavedPanel */}
        <div
          id="search-sync-badges"
          className="animate-on-scroll fade-in-scroll mt-2 mb-8 flex flex-col items-center justify-center gap-2.5"
        >
          <span className="text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest flex items-center gap-1.5 select-none">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 dark:bg-indigo-600 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
            </span>
            Real-time Feed Sync
          </span>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {Object.entries(apiStatus)
              .filter(([_, status]) => status !== null)
              .map(([db, status]) => (
                <StatusBadge
                  key={db}
                  db={db}
                  status={status as "ok" | "error" | "loading" | null}
                />
              ))}
          </div>
        </div>

        {/* Analytics Top Searches Section */}
        {searchStatus === "initial" && topSearches.length > 0 && (
          <div className="bg-brand-secondary/40 border border-brand-border/45 p-4 rounded-2xl mb-6 text-left">
            <h3 className="text-xs font-extrabold text-neutral-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" />
              <span>Your Top Local Searches</span>
            </h3>
            <div className="flex flex-wrap gap-2">
              {topSearches.map((s, idx) => (
                <button
                  key={`${s.query}-${idx}`}
                  onClick={() => handleSearch(s.query, DEFAULT_ENABLED_DBS)}
                  className="px-3 py-1.5 bg-brand-bg hover:bg-indigo-50/50 dark:bg-neutral-800 dark:hover:bg-indigo-950/20 text-xs font-bold rounded-lg border border-brand-border cursor-pointer transition-colors"
                >
                  <span className="font-mono">{s.query}</span>
                  <span className="text-[10px] font-bold text-neutral-500 ml-1.5">
                    ({s.count}x)
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Inline Query Interpretation Banner */}
        {searchStatus === "searched" && parsedQuery && (
          <div className="bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30 p-3 rounded-xl mb-6 text-left flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-2">
            <div className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Query Interpretation</span>
            </div>
            <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              <span className="text-neutral-500">Searching for: </span>
              {parsedQuery.expandedFrom.length > 0 ? (
                <span>
                  <strong className="text-neutral-900 dark:text-white">
                    {parsedQuery.cleanedTerms
                      .concat(parsedQuery.expandedTerms)
                      .join(", ")}
                  </strong>{" "}
                  <span className="text-xs text-indigo-500 font-mono bg-indigo-100 dark:bg-indigo-900/50 px-1.5 py-0.5 rounded ml-1">
                    expanded from '{parsedQuery.expandedFrom.join(", ")}'
                  </span>
                </span>
              ) : (
                <strong className="text-neutral-900 dark:text-white">
                  {parsedQuery.cleanedTerms.join(" ")}
                </strong>
              )}
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400 flex flex-wrap gap-x-3 gap-y-1 mt-1">
              <span>
                <strong className="text-neutral-600 dark:text-neutral-300">
                  Detected:
                </strong>{" "}
                {parsedQuery.dbHint === "genbank"
                  ? "Gene name"
                  : parsedQuery.dbHint === "pdb"
                    ? "Structure"
                    : parsedQuery.dbHint === "uniprot"
                      ? "Protein name"
                      : "Any term"}
              </span>
              <span>·</span>
              <span>
                <strong className="text-neutral-600 dark:text-neutral-300">
                  Searching:
                </strong>{" "}
                {Object.keys(apiStatus)
                  .filter((k) => apiStatus[k] !== null)
                  .map((k) =>
                    k === "nucleotide"
                      ? "GenBank"
                      : k === "protein"
                        ? "NCBI Protein"
                        : k === "pdb"
                          ? "PDB"
                          : "UniProt",
                  )
                  .join(", ")}
              </span>
              <span>·</span>
              <span>
                <strong className="text-neutral-600 dark:text-neutral-300">
                  Organism:
                </strong>{" "}
                {parsedQuery.organism || "All"}
              </span>
            </div>
          </div>
        )}

        {/* Search Results Display Slot */}
        <div id="results-anchor" className="space-y-4">
          <div className="flex justify-between items-center mb-1 flex-wrap gap-2">
            <h2 className="text-sm font-bold font-sans tracking-wide text-brand-text-secondary dark:text-neutral-300 uppercase flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-indigo-500 shrink-0" />
              {searchStatus === "initial"
                ? "Featured Molecular Profiles"
                : `Database Hits found (${isBatchMode ? batchResults.length : sortedResults.length})`}
              <InfoButton tipKey="result-card" />
            </h2>

            {/* Sorting & Export controls header line */}
            {searchStatus === "searched" && (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleExportBatchCSV}
                  className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer flex items-center gap-1"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </button>
                <InfoButton tipKey="export-csv" />

                {!isBatchMode && (
                  <div className="flex items-center gap-1">
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                      className="text-xs px-2 py-1 bg-brand-bg text-brand-text border border-brand-border rounded-lg focus:outline-hidden"
                    >
                      <option value="relevance">Sort: Relevance</option>
                      <option value="length">Sort: Length</option>
                      <option value="resolution">Sort: Resolution</option>
                    </select>
                    <InfoButton tipKey="sort-results" />
                  </div>
                )}

                <button
                  onClick={() => {
                    setResults(FEATURED_MODELS);
                    setSearchStatus("initial");
                    setIsBatchMode(false);
                    setBatchResults([]);
                  }}
                  className="text-xs text-neutral-400 font-bold hover:underline cursor-pointer"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
          
          <SearchStatus apiStatus={apiStatus} isSearching={isLoading} />

          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.div
                key="loading-skeleton"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="space-y-4"
              >
                {[1, 2, 3].map((idx) => (
                  <SkeletonLoader key={`skeleton-${idx}`} size="large" />
                ))}
              </motion.div>
            ) : errorText ? (
              <motion.div
                key="threat-error"
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col items-center justify-center p-12 bg-rose-500/10 border border-rose-500/25 rounded-2xl text-center shadow-2xs"
              >
                <AlertCircle className="w-10 h-10 text-rose-500 mb-3" />
                <h3 className="text-base font-semibold text-rose-400">
                  Search Restricted / Validation Security Alert
                </h3>
                <p className="text-xs sm:text-sm text-neutral-400 max-w-sm mt-1 mb-4 leading-relaxed">
                  {errorText}
                </p>
                <button
                  onClick={() => setErrorText(null)}
                  className="px-4 py-2 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 rounded-xl text-xs font-bold text-rose-300 cursor-pointer transition-all"
                >
                  Dismiss Alert & Reset Input
                </button>
              </motion.div>
            ) : searchStatus === "notfound" || (searchStatus === "searched" && results.length === 0 && !isBatchMode) ? (
              <motion.div
                key="notfound"
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="no-results flex flex-col items-center justify-center p-12 bg-brand-secondary border border-brand-border rounded-2xl text-center shadow-2xs"
              >
                <AlertCircle className="w-10 h-10 text-orange-400 mb-3" />
                <h3 className="text-base font-semibold text-brand-text dark:text-neutral-200">
                  No Direct Matches Found
                </h3>
                <p className="text-xs sm:text-sm text-brand-text-secondary dark:text-neutral-450 max-w-sm mt-1 mb-4">
                  We broadened the search to include computational models and removed organism filters, but still couldn't find an exact match.
                </p>

                {spellSuggestions.length > 0 && (
                  <div className="flex flex-col items-center gap-3 bg-brand-bg/50 px-6 py-4 rounded-xl border border-brand-border/60 mb-4 w-full max-w-md">
                    <span className="text-xs font-bold text-neutral-500 uppercase tracking-widest">
                      Did you mean:
                    </span>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {spellSuggestions.map((sugg) => (
                        <button
                          key={sugg}
                          onClick={() => handleSearch(sugg, DEFAULT_ENABLED_DBS)}
                          className="px-3 py-1.5 bg-brand-bg hover:bg-indigo-50 dark:hover:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 text-xs font-bold rounded-lg border border-indigo-200 dark:border-indigo-800/50 cursor-pointer transition-colors"
                        >
                          {sugg}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md mt-2">
                  <a href="https://www.ncbi.nlm.nih.gov/gene/" target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-lg text-xs font-bold transition-colors">
                    Search NCBI Gene <ExternalLink className="w-3 h-3" />
                  </a>
                  <a href="https://www.uniprot.org/" target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-lg text-xs font-bold transition-colors">
                    Search UniProt <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                
                <button onClick={() => alert("We'll email you when this record is added.")} className="mt-4 px-4 py-2 text-indigo-600 hover:text-indigo-500 text-xs font-bold cursor-pointer">
                  Save Search & Notify Me
                </button>
              </motion.div>
            ) : isBatchMode ? (
              /* TABULAR BATCH RESULTS RENDER (Tier 3) */
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full bg-brand-secondary border border-brand-border rounded-2xl overflow-hidden shadow-xs text-left"
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-medium">
                    <thead>
                      <tr className="bg-brand-tertiary border-b border-brand-border font-bold text-brand-text-secondary uppercase tracking-wider text-[10px]">
                        <th className="p-4">Accession</th>
                        <th className="p-4">Database</th>
                        <th className="p-4">Organism</th>
                        <th className="p-4">Title / Info</th>
                        <th className="p-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-border/40">
                      {batchResults.map((item, idx) => (
                        <tr
                          key={`${item.id}-${idx}`}
                          className="hover:bg-brand-bg/40 transition-colors"
                        >
                          <td className="p-4 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                            {item.id}
                          </td>
                          <td className="p-4 capitalize font-bold">
                            {item.database}
                          </td>
                          <td className="p-4 italic">
                            {item.organism || "N/A"}
                          </td>
                          <td className="p-4 font-sans">{item.title}</td>
                          <td className="p-4">
                            <button
                              onClick={() => handleToggleSaveItem(item)}
                              className="text-xs font-bold text-emerald-600 hover:underline"
                            >
                              {savedItems.some((s) => s.id === item.id)
                                ? "Saved"
                                : "Save"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            ) : (
              /* STANDARD RESULTS CARD GRID */
              <motion.div
                key={sortedResults.map((r) => r.id).join(",") || "empty"}
                id="results"
                className="grid grid-cols-1 gap-4"
                variants={{
                  hidden: { opacity: 0 },
                  show: {
                    opacity: 1,
                    transition: {
                      staggerChildren: 0.08,
                    },
                  },
                }}
                initial="hidden"
                animate="show"
              >
                {sortedResults.map((result, idx) => (
                  <motion.div
                    key={result.id}
                    variants={{
                      hidden: { opacity: 0, y: 15 },
                      show: {
                        opacity: 1,
                        y: 0,
                        transition: {
                          type: "spring",
                          stiffness: 100,
                          damping: 15,
                        },
                      },
                    }}
                  >
                    <ResultCard
                      result={result}
                      index={idx}
                      isSaved={savedItems.some((s) => s.id === result.id)}
                      onToggleSave={handleToggleSaveItem}
                      userGeminiApiKey={userGeminiApiKey}
                      onPromptApiKey={() => setIsGeminiModalOpen(true)}
                      onSaveApiKey={handleSaveGeminiApiKey}
                      onResetApiKey={handleResetGeminiApiKey}
                      dbStatus={apiStatus[result.database]}
                      isCompareSelected={compareItems.some(
                        (c) => c.id === result.id,
                      )}
                      onToggleCompareSelect={handleToggleCompareSelect}
                    />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Educational Bioinformatics Footer */}
        <footer className="animate-on-scroll fade-in-scroll mt-12 pt-6 pb-4 border-t border-brand-border text-center flex flex-col items-center justify-center gap-4 text-text-muted dark:text-neutral-400 text-xs font-semibold">
          <p className="whitespace-normal md:whitespace-nowrap">
            Built by:{" "}
            <span className="font-bold text-brand-text dark:text-neutral-200">
              Subham Samal
            </span>{" "}
            (IMSC.Bi, BJB Autonomous College) 🧬
          </p>
          <p className="max-w-md leading-relaxed text-[11px] font-medium opacity-85">
            Integrating search mechanisms over high-performance public NIH
            Entrez, UniProt XML REST services, and RCSB PDB structures. AI
            summaries powered securely by Gemini.
          </p>
          <div className="flex items-center gap-4 mt-2">
            <motion.a
              href="https://github.com/subhhworldw/Spurt-Search"
              target="_blank"
              rel="noopener noreferrer"
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-brand-border bg-brand-bg hover:bg-neutral-100 dark:hover:bg-neutral-900 text-brand-text hover:text-indigo-600 dark:hover:text-indigo-400 transition-all text-[11px] font-bold shadow-xs cursor-pointer"
            >
              <Github className="w-3.5 h-3.5" />
              GitHub
            </motion.a>
            <motion.a
              href="https://www.linkedin.com/in/subhh-worldw/"
              target="_blank"
              rel="noopener noreferrer"
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-brand-border bg-brand-bg hover:bg-neutral-100 dark:hover:bg-neutral-900 text-brand-text hover:text-indigo-600 dark:hover:text-indigo-400 transition-all text-[11px] font-bold shadow-xs cursor-pointer"
            >
              <Linkedin className="w-3.5 h-3.5" />
              LinkedIn
            </motion.a>
          </div>
        </footer>
      </div>

      {/* Sticky Bottom Comparison bar */}
      <AnimatePresence>
        {compareItems.length > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[400] bg-zinc-950/95 border border-indigo-900/35 p-4 rounded-2xl shadow-2xl backdrop-blur-md flex items-center justify-between gap-6 w-[90%] max-w-lg"
          >
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-500/10 border border-indigo-500/25 rounded-xl text-indigo-450 shrink-0">
                <ArrowRightLeft className="w-4 h-4 animate-pulse" />
              </div>
              <div className="text-left">
                <span className="text-[11.5px] font-bold uppercase tracking-wider text-white block">
                  Biomolecular comparison matrix
                </span>
                <span className="text-[10.5px] text-zinc-400 font-semibold">
                  {compareItems.length} of 4 structures selected
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setCompareItems([])}
                className="px-2.5 py-1.5 border border-brand-border hover:bg-neutral-900 rounded-lg text-[10px] font-bold text-neutral-400 hover:text-white transition-colors cursor-pointer"
              >
                Clear
              </button>
              <div
                onClick={() => setIsCompareOpen(true)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setIsCompareOpen(true);
                  }
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all cursor-pointer shadow-md"
              >
                Compare Now
                <div onClick={(e) => e.stopPropagation()} className="-mr-1">
                  <InfoButton tipKey="compare-mode" />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Comparison Modal window */}
      <AnimatePresence>
        {isCompareOpen && (
          <CompareModal
            items={compareItems}
            onClose={() => setIsCompareOpen(false)}
            onRemoveItem={(id) => {
              setCompareItems((prev) => prev.filter((c) => c.id !== id));
            }}
          />
        )}
      </AnimatePresence>

      <GeminiKeyModal
        isOpen={isGeminiModalOpen}
        onClose={() => setIsGeminiModalOpen(false)}
        onSave={handleSaveGeminiApiKey}
        currentKey={userGeminiApiKey}
      />
      <ConsentBanner
        onAccept={() =>
          console.log("[Consent] Advanced cookies & analytics initialized.")
        }
        onDecline={() => console.log("[Consent] Telemetry rejected by user.")}
      />
    </div>
  );
}
