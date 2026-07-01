import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Bookmark,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Check,
  Lock,
  Key,
  AlertCircle,
  Copy,
  FileDown,
  Layers,
  Info,
  Eye,
  EyeOff,
  FlaskConical,
  Globe,
} from "lucide-react";
import { SearchResult } from "../types";
import { motion, AnimatePresence } from "motion/react";
import StatusBadge from "./StatusBadge";
import { GoogleGenAI } from "@google/genai";
import { InfoButton } from "./InfoButton";

interface ResultCardProps {
  key?: string | number;
  result: SearchResult;
  isSaved: boolean;
  onToggleSave: (item: SearchResult) => void;
  userGeminiApiKey: string;
  onPromptApiKey: () => void;
  onSaveApiKey?: (key: string) => void;
  onResetApiKey: () => void;
  dbStatus?: "ok" | "error" | "loading" | null;
  index?: number;

  // Compare Mode props
  isCompareSelected: boolean;
  onToggleCompareSelect: (item: SearchResult) => void;
}

export default function ResultCard({
  result,
  isSaved,
  onToggleSave,
  userGeminiApiKey,
  onPromptApiKey,
  onSaveApiKey,
  onResetApiKey,
  dbStatus,
  index,
  isCompareSelected,
  onToggleCompareSelect,
}: ResultCardProps) {
  const [summary, setSummary] = useState<string | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);

  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);
  const [sequence, setSequence] = useState<string | null>(
    result.sequence || null,
  );
  const [isFetchingSequence, setIsFetchingSequence] = useState(false);
  const [sequenceError, setSequenceError] = useState<string | null>(null);

  const [inlineKey, setInlineKey] = useState("");
  const [showInlineKey, setShowInlineKey] = useState(false);
  const [isSavedInline, setIsSavedInline] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [showToast, setShowToast] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.id);
      setIsCopied(true);
      setShowToast(true);
      setTimeout(() => {
        setIsCopied(false);
      }, 2000);
      setTimeout(() => {
        setShowToast(false);
      }, 2800);
    } catch (err) {
      console.error("Clipboard copy failed:", err);
    }
  };

  const handleCopySequence = async () => {
    if (!sequence) return;
    try {
      await navigator.clipboard.writeText(sequence);
      alert("Sequence copied to clipboard!");
    } catch (err) {
      console.error("Sequence copy failed:", err);
    }
  };

  // Live real sequence fetch direct from biological endpoints!
  const fetchSequenceData = async () => {
    if (sequence) return;
    setIsFetchingSequence(true);
    setSequenceError(null);
    try {
      let fetchedSeq = "";
      const isProteinDb =
        result.database === "uniprot" || result.database === "protein";

      if (result.database === "uniprot") {
        const res = await fetch(
          `https://rest.uniprot.org/uniprotkb/${result.id}.json`,
        );
        if (!res.ok) throw new Error("UniProt record sequence load failed.");
        const json = await res.json();
        fetchedSeq = json?.sequence?.value || "";
      } else if (result.database === "pdb") {
        // Fetch structural fasta
        const res = await fetch(
          `https://www.rcsb.org/fasta/entry/${result.id}`,
        );
        if (!res.ok) throw new Error("PDB structure fasta load failed.");
        const text = await res.text();
        // Extract sequence lines
        fetchedSeq = text
          .split("\n")
          .filter((l) => !l.startsWith(">"))
          .join("")
          .trim();
      } else {
        // NCBI Efetch
        const dbType = result.database === "protein" ? "protein" : "nucleotide";
        const res = await fetch(
          `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=${dbType}&id=${result.id}&rettype=fasta&retmode=text`,
        );
        if (!res.ok) throw new Error("NCBI sequence load failed.");
        const text = await res.text();
        fetchedSeq = text
          .split("\n")
          .filter((l) => !l.startsWith(">"))
          .join("")
          .trim();
      }

      if (!fetchedSeq) {
        throw new Error(
          "Unable to locate sequence segment for this accession.",
        );
      }
      setSequence(fetchedSeq);
      result.sequence = fetchedSeq; // persist locally in object ref
    } catch (err: any) {
      setSequenceError(err.message || "Failed to fetch biological sequence.");
    } finally {
      setIsFetchingSequence(false);
    }
  };

  const handleDownloadFASTA = () => {
    const seq =
      sequence || "MOCKSEQUENCEPEPTIDESTRINGREPRESENTATIONFORHIGHLIGHT";
    const fastaContent = `>${result.id} | ${result.title} [${result.organism || "Unknown Organism"}]\n${(seq.match(/.{1,60}/g) || [seq]).join("\n")}`;
    const blob = new Blob([fastaContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${result.id}_spurt_export.fasta`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Calculations for nucleotide GC% and protein molecular weight estimates
  const getGCContent = () => {
    if (!sequence) return null;
    const clean = sequence.toUpperCase().replace(/[^ATCG]/g, "");
    if (clean.length === 0) return 0;
    const gc = clean.replace(/[^CG]/g, "").length;
    return Math.round((gc / clean.length) * 100);
  };

  const getEstimatedMolWeight = () => {
    if (!sequence) return null;
    // Rough estimate: average amino acid is 110 Daltons
    return Math.round((sequence.length * 110) / 1000); // in kDa
  };

  // Automatically clear errors if the key is reset globally, but keep the summary view open
  useEffect(() => {
    if (!userGeminiApiKey) {
      setSummaryError(null);
    }
  }, [userGeminiApiKey]);

  const handleSaveInlineKey = async () => {
    const trimmed = inlineKey.trim();
    if (!trimmed) return;
    if (onSaveApiKey) {
      onSaveApiKey(trimmed);
    }
    setIsSavedInline(true);
    setIsLoadingSummary(true);
    setSummaryError(null);
    setIsSummaryOpen(true);
    try {
      const ai = new GoogleGenAI({ apiKey: trimmed });
      const prompt = `You are an expert bioinformatician and molecular biologist. Summarize the biological significance of the following database entry:
Database: ${result.database}
Identifier/ID: ${result.id}
Category/Type: ${result.category || "General"}
Title: ${result.title || "N/A"}
Description: ${result.description || "N/A"}

Please provide a highly professional, scientifically rich, but clear 2-3 sentence summary explaining:
1. What this molecule/sequence/structure is and its origin (taxon/organism if stated).
2. Its physiological function, role in cellular processes, or biochemical properties.
3. Its scientific or clinical significance (e.g., connection to diseases, mutations, drug targets, or laboratory applications).

Provide ONLY the informative description. Avoid repetitive text, do not create any lists, and do not prefix the answer with introductory phrases like "This entry refers to..."`;

      let responseText = "";
      let lastError = null;
      const modelsToTry = [
        "gemini-3.1-flash-lite",
        "gemini-3.5-flash",
        "gemini-flash-latest",
      ];

      for (const modelName of modelsToTry) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
              maxOutputTokens: 150,
              temperature: 0.25,
            },
          });
          if (response && response.text) {
            responseText = response.text.trim();
            break;
          }
        } catch (err: any) {
          lastError = err;
          console.warn(
            `Browser-direct model "${modelName}" failed/overloaded (Error: ${err.message || err}). Trying next model option...`,
          );
        }
      }

      if (responseText) {
        setSummary(responseText);
      } else {
        if (lastError) throw lastError;
        throw new Error(
          "Unable to retrieve summary bio-annotation. Please verify your connection status and key permissions.",
        );
      }
    } catch (err: any) {
      console.error("AI Summary inline error:", err);
      let msg =
        err.message || "An unexpected error occurred during summarization.";
      try {
        if (msg.includes("Gemini API Key returned an error:")) {
          const jsonMatch = msg.match(/\{.*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.error && parsed.error.message) {
              msg = `The provided Gemini API Key returned an error: "${parsed.error.message}" (Code: ${parsed.error.code}, Status: ${parsed.error.status || "UNAVAILABLE"}).`;
            }
          }
        }
      } catch (parseError) {}
      setSummaryError(msg);
    } finally {
      setIsLoadingSummary(false);
      setIsSavedInline(false);
    }
  };

  const fetchSummary = async () => {
    setIsLoadingSummary(true);
    setSummaryError(null);
    setIsSummaryOpen(true);
    try {
      if (userGeminiApiKey) {
        const ai = new GoogleGenAI({ apiKey: userGeminiApiKey });
        const prompt = `You are an expert bioinformatician and molecular biologist. Summarize the biological significance of the following database entry:
Database: ${result.database}
Identifier/ID: ${result.id}
Category/Type: ${result.category || "General"}
Title: ${result.title || "N/A"}
Description: ${result.description || "N/A"}

Please provide a highly professional, scientifically rich, but clear 2-3 sentence summary explaining:
1. What this molecule/sequence/structure is and its origin (taxon/organism if stated).
2. Its physiological function, role in cellular processes, or biochemical properties.
3. Its scientific or clinical significance (e.g., connection to diseases, mutations, drug targets, or laboratory applications).

Provide ONLY the informative description. Avoid repetitive text, do not create any lists, and do not prefix the answer with introductory phrases like "This entry refers to..."`;

        let responseText = "";
        let lastError = null;
        const modelsToTry = [
          "gemini-3.1-flash-lite",
          "gemini-3.5-flash",
          "gemini-flash-latest",
        ];

        for (const modelName of modelsToTry) {
          try {
            const response = await ai.models.generateContent({
              model: modelName,
              contents: prompt,
              config: {
                maxOutputTokens: 150,
                temperature: 0.25,
              },
            });
            if (response && response.text) {
              responseText = response.text.trim();
              break;
            }
          } catch (err: any) {
            lastError = err;
            console.warn(
              `Browser-direct model "${modelName}" failed/overloaded (Error: ${err.message || err}). Trying next model option...`,
            );
          }
        }

        if (responseText) {
          setSummary(responseText);
        } else {
          if (lastError) {
            throw lastError;
          }
          throw new Error(
            "Unable to retrieve summary bio-annotation. Please verify your connection status and key permissions.",
          );
        }
      } else {
        const response = await fetch("/api/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: result.id,
            title: result.title,
            description: result.description,
            database: result.database,
            category: result.category,
            userApiKey: "",
          }),
        });

        const contentType = response.headers.get("content-type") || "";
        let data: any = null;
        let responseText = "";

        try {
          responseText = await response.text();
        } catch (textErr) {
          throw new Error(
            "Could not retrieve responses from the summarization server.",
          );
        }

        if (
          contentType.includes("application/json") ||
          responseText.trim().startsWith("{")
        ) {
          try {
            data = JSON.parse(responseText);
          } catch (jsonErr) {
            throw new Error(
              "Unable to parse API response. Please verify your connection.",
            );
          }
        } else {
          if (
            responseText.trim().startsWith("<") ||
            responseText.includes("The page") ||
            responseText.includes("<!DOCTYPE html>")
          ) {
            throw new Error("STATIC_HOST_NO_KEY");
          } else {
            throw new Error(
              responseText ||
                `Server responded with status code: ${response.status}`,
            );
          }
        }

        if (!response.ok) {
          if (data && data.error === "NO_API_KEY") {
            setIsSummaryOpen(false);
            setIsLoadingSummary(false);
            onPromptApiKey();
            return;
          }
          throw new Error(
            (data && data.message) ||
              `Failed to contact summarization server: Status ${response.status}`,
          );
        }
        setSummary(data.summary);
      }
    } catch (err: any) {
      console.error("AI Summary error:", err);
      let msg =
        err.message || "An unexpected error occurred during summarization.";
      if (
        msg === "STATIC_HOST_NO_KEY" ||
        msg.includes("Failed to fetch") ||
        msg.includes("Load failed") ||
        msg.includes("NetworkError")
      ) {
        msg = "STATIC_HOST_NO_KEY";
      } else {
        try {
          if (msg.includes("Gemini API Key returned an error:")) {
            const jsonMatch = msg.match(/\{.*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              if (parsed.error && parsed.error.message) {
                msg = `The provided Gemini API Key returned an error: "${parsed.error.message}" (Code: ${parsed.error.code}, Status: ${parsed.error.status || "UNAVAILABLE"}).`;
              }
            }
          }
        } catch (parseError) {}
      }
      setSummaryError(msg);
    } finally {
      setIsLoadingSummary(false);
    }
  };

  let dbBadgeColor = "";
  let dbAccentBorder = "";
  if (result.database === "uniprot") {
    dbBadgeColor =
      "bg-purple-100/60 text-purple-800 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900/40";
    dbAccentBorder = isCompareSelected
      ? "border-indigo-500 ring-2 ring-indigo-500/20"
      : "hover:border-purple-400 dark:hover:border-purple-900";
  } else if (result.database === "pdb") {
    dbBadgeColor =
      "bg-amber-100/60 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/40";
    dbAccentBorder = isCompareSelected
      ? "border-indigo-500 ring-2 ring-indigo-500/20"
      : "hover:border-amber-400 dark:hover:border-amber-900";
  } else {
    dbBadgeColor =
      "bg-emerald-100/60 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/40";
    dbAccentBorder = isCompareSelected
      ? "border-indigo-500 ring-2 ring-indigo-500/20"
      : "hover:border-emerald-450 dark:hover:border-emerald-900";
  }

  return (
    <div
      className={`result-card-anim w-full p-5 bg-brand-secondary border border-brand-border rounded-2xl shadow-xs transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${dbAccentBorder}`}
      style={{ "--card-index": index ?? 0 } as React.CSSProperties}
      data-id={result.id}
      data-db={result.database}
      data-category={result.category}
    >
      <div className="flex justify-between items-start gap-4 flex-wrap sm:flex-nowrap">
        {/* Checkbox and Badge */}
        <div className="flex-1 min-w-0 flex items-start gap-3">
          {/* Select to Compare checkbox */}
          <input
            type="checkbox"
            checked={isCompareSelected}
            onChange={() => onToggleCompareSelect(result)}
            title="Select to compare side-by-side"
            className="w-4 h-4 mt-1 rounded-sm border-neutral-300 text-indigo-600 focus:ring-indigo-500 accent-indigo-600 dark:accent-indigo-500 cursor-pointer shrink-0"
          />

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span
                className={`db-badge px-2 py-0.5 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider border ${dbBadgeColor}`}
              >
                {result.database === "genbank" ? "GenBank" : result.database}
              </span>
              {result.mergedFrom && (
                <span className="text-[9px] font-bold uppercase tracking-widest bg-amber-500/10 text-amber-700 dark:bg-amber-950/30 dark:text-amber-450 px-1.5 py-0.5 rounded border border-amber-500/20">
                  Deduplicated ({result.mergedFrom.length} DBs)
                </span>
              )}
              <span className="flex items-center gap-1 text-[11px] font-mono text-brand-text-muted dark:text-neutral-400 px-1.5 py-0.5 bg-brand-tertiary dark:bg-neutral-800 rounded-md font-semibold">
                ID: {result.id}
                <InfoButton tipKey="result-card" />
              </span>
              {/* Trust Signal Badges */}
              {result.reviewed && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-green-100 text-green-800 border border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800/50" aria-label="Curated Entry">
                  <Check className="w-3 h-3" /> Curated
                </span>
              )}
              {result.reviewed === false && result.database === 'uniprot' && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-orange-100 text-orange-800 border border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800/50" aria-label="Unreviewed Entry">
                  <AlertCircle className="w-3 h-3" /> Unreviewed
                </span>
              )}
              {result.experimentalMethod && !result.experimentalMethod.toLowerCase().includes('model') && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50" aria-label="Experimental Structure">
                  <FlaskConical className="w-3 h-3" /> Experimental
                </span>
              )}
              {result.experimentalMethod && result.experimentalMethod.toLowerCase().includes('model') && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-orange-100 text-orange-800 border border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800/50" aria-label="Computational Model">
                  <AlertCircle className="w-3 h-3" /> Computational Model
                </span>
              )}
              {result.isCanonical && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-800 border border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800/50" aria-label="Canonical Isoform">
                  <Layers className="w-3 h-3" /> Canonical Isoform
                </span>
              )}
            </div>

            <h3 className="result-title text-base sm:text-lg font-bold text-neutral-950 dark:text-white tracking-tight leading-snug flex items-center gap-2">
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline inline-flex items-center gap-1.5"
              >
                {result.title}
                <ExternalLink className="w-4 h-4 text-brand-text-muted shrink-0" />
              </a>
              <div onClick={(e) => e.stopPropagation()}>
                <InfoButton tipKey="deep-link" />
              </div>
            </h3>

            {/* Metadata (Release Date) */}
            <div className="mt-2 flex flex-wrap items-center gap-4">
              {result.releaseDate && (
                <div className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400">
                  Updated: {result.releaseDate}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action Toggles */}
        <div className="result-actions flex items-center gap-2 shrink-0">
          <button
            onClick={handleCopy}
            title="Copy entry identifier"
            className={`copy-button px-2.5 py-1.5 border rounded-xl hover:shadow-xs transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold ${
              isCopied
                ? "bg-indigo-50/55 text-indigo-700 border-indigo-200 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-900/40"
                : "bg-brand-bg text-brand-text-secondary border-brand-border hover:bg-brand-tertiary"
            }`}
          >
            {isCopied ? (
              <Check className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span>{isCopied ? "Copied" : "Copy"}</span>
          </button>

          <button
            onClick={() => onToggleSave(result)}
            title={isSaved ? "Remove from saved" : "Save structure"}
            className={`save-button p-2 border rounded-xl hover:shadow-xs transition-all cursor-pointer flex items-center gap-1 text-xs font-semibold ${
              isSaved
                ? "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/50"
                : "bg-brand-bg text-brand-text-secondary border-brand-border hover:bg-brand-tertiary"
            }`}
          >
            <Bookmark
              className={`w-4 h-4 ${isSaved ? "fill-emerald-500 text-emerald-500" : ""}`}
            />
            <span>{isSaved ? "Saved" : "Save"}</span>
          </button>
        </div>
      </div>

      <p className="result-description text-sm text-brand-text-secondary dark:text-neutral-300 font-medium font-sans mt-3 line-clamp-3">
        {result.description}
      </p>

      {/* Dynamic 3D Macromolecule Ribbon Illustration when result is available from PDB/PDB structure */}
      {result.database === "pdb" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mt-4 p-4 rounded-xl bg-amber-500/5 dark:bg-amber-500/5 border border-amber-500/15 bg-gradient-to-r from-amber-500/10 dark:from-amber-950/15 to-transparent flex flex-col sm:flex-row items-center gap-4 shadow-[0_2px_8px_-1px_rgba(245,158,11,0.05)]"
        >
          <div className="relative w-16 h-16 bg-amber-500/10 dark:bg-amber-950/30 rounded-full border border-amber-500/20 flex items-center justify-center overflow-hidden shrink-0">
            <span className="absolute inset-1 border border-dashed border-amber-500/20 rounded-full animate-spin [animation-duration:12s]" />
            <span className="absolute inset-2.5 border border-dashed border-amber-500/30 rounded-full animate-spin [animation-direction:reverse] [animation-duration:8s]" />

            <motion.svg
              viewBox="0 0 100 100"
              className="w-10 h-10 text-amber-500 dark:text-amber-400"
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 20, ease: "linear" }}
            >
              <path
                d="M 20,50 Q 35,20 50,50 T 80,50"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                className="opacity-80"
              />
              <path
                d="M 20,50 Q 35,80 50,50 T 80,50"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                className="opacity-45"
                strokeDasharray="4,3"
              />
              <circle cx="20" cy="50" r="4.5" fill="currentColor" />
              <circle
                cx="50"
                cy="50"
                r="5"
                fill="currentColor"
                className="text-amber-600 dark:text-amber-300"
              />
              <circle cx="80" cy="50" r="4.5" fill="currentColor" />
              <circle cx="35" cy="28" r="3.5" fill="currentColor" />
              <circle cx="65" cy="72" r="3.5" fill="currentColor" />
            </motion.svg>
          </div>
          <div className="flex-1 text-center sm:text-left min-w-0">
            <h4 className="text-xs font-bold text-amber-800 dark:text-amber-400 uppercase tracking-widest leading-none mb-1 flex items-center justify-center sm:justify-start gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse inline-block" />
              3D Structural Coordinates Available
            </h4>
            <p className="text-[11.5px] text-brand-text-secondary dark:text-neutral-400 font-medium font-sans leading-relaxed">
              Atomic resolution biological macromolecular assembly ({result.id})
              is resolved via high-resolution experimental methods. Structure
              features curated fold annotations, structural interfaces, and
              complete structural maps.
            </p>
          </div>
        </motion.div>
      )}

      {/* Collapsible Card Details Area (Taxonomy, Sequence length, cross DBs, Sequence FASTA) */}
      <AnimatePresence>
        {isDetailsExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 pt-4 border-t border-brand-border/60 text-left space-y-3.5 text-xs overflow-hidden"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-brand-tertiary/20 p-4 rounded-xl border border-brand-border/40">
              <div className="space-y-1.5">
                <span className="flex items-center gap-1.5 text-[10px] uppercase font-extrabold text-neutral-400 tracking-wider">
                  Classification & Origin
                  <InfoButton tipKey="overview-tab" />
                </span>
                <p className="font-bold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
                  Organism:{" "}
                  <span className="font-medium italic">
                    {result.organism || "Unknown Taxonomy"}
                  </span>
                  <InfoButton tipKey="filter-organism" />
                </p>
                {result.annotationScore && (
                  <p className="font-bold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
                    Annotation Score:{" "}
                    <span className="font-medium">
                      {result.annotationScore}/5
                    </span>
                    <InfoButton tipKey="sort-results" />
                  </p>
                )}
                {result.sequenceLength && (
                  <p className="font-bold text-neutral-800 dark:text-neutral-200">
                    Sequence Length:{" "}
                    <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold">
                      {result.sequenceLength.toLocaleString()}{" "}
                      {result.database === "uniprot"
                        ? "amino acids"
                        : "base pairs"}
                    </span>
                  </p>
                )}
                {result.experimentalMethod && (
                  <p className="font-bold text-neutral-800 dark:text-neutral-200">
                    Experimental Method:{" "}
                    <span className="font-medium">
                      {result.experimentalMethod}
                    </span>
                  </p>
                )}
                {result.resolution && (
                  <p className="font-bold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
                    Resolution:{" "}
                    <span className="font-mono text-amber-600 dark:text-amber-450 font-bold">
                      {result.resolution} Å
                    </span>
                    <InfoButton tipKey="filter-resolution" />
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <span className="flex items-center gap-1.5 text-[10px] uppercase font-extrabold text-neutral-400 tracking-wider">
                  Cross-Database Identifiers
                  <InfoButton tipKey="cross-refs-tab" />
                </span>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <a
                    href={`https://www.ncbi.nlm.nih.gov/nuccore/${result.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 rounded text-[10px] font-bold"
                  >
                    GenBank ↗
                  </a>
                  <a
                    href={`https://www.uniprot.org/uniprotkb/${result.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2 py-1 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 text-purple-700 dark:text-purple-400 rounded text-[10px] font-bold"
                  >
                    UniProt KB ↗
                  </a>
                  <a
                    href={`https://www.rcsb.org/structure/${result.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-700 dark:text-amber-400 rounded text-[10px] font-bold"
                  >
                    RCSB PDB ↗
                  </a>
                </div>
              </div>
            </div>

            {/* Live FASTA / Sequence Preview section */}
            <div className="border border-brand-border/60 rounded-xl p-3 bg-brand-bg/40 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="flex items-center gap-1.5 text-[10px] uppercase font-extrabold text-neutral-400 tracking-wider">
                  Live Sequence FASTA Preview
                  <InfoButton tipKey="sequence-tab" />
                </span>
                {!sequence ? (
                  <button
                    onClick={fetchSequenceData}
                    disabled={isFetchingSequence}
                    className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-[10.5px] font-bold cursor-pointer transition-colors"
                  >
                    {isFetchingSequence
                      ? "Loading Accession..."
                      : "Fetch Sequence Preview"}
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleCopySequence}
                      className="px-2 py-1 bg-brand-tertiary hover:bg-brand-secondary border border-brand-border rounded text-[10px] font-bold cursor-pointer flex items-center gap-1 text-brand-text"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy Sequence</span>
                    </button>
                    <button
                      onClick={handleDownloadFASTA}
                      className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-bold cursor-pointer flex items-center gap-1"
                    >
                      <FileDown className="w-3 h-3" />
                      <span>Download FASTA</span>
                    </button>
                    <InfoButton tipKey="export-fasta" />
                  </div>
                )}
              </div>

              {sequence && (
                <div className="space-y-2">
                  <div className="font-mono text-[11px] p-2 bg-black text-emerald-400 rounded border border-neutral-800 overflow-x-auto whitespace-pre-wrap max-h-24 select-all leading-normal">
                    {sequence.slice(0, 120)}...
                    {sequence.length > 120 && (
                      <span className="text-zinc-500 italic">
                        {" "}
                        (truncated, {sequence.length - 120} chars remaining)
                      </span>
                    )}
                  </div>
                  {/* Bio metrics */}
                  <div className="flex gap-4 text-[10px] font-extrabold text-neutral-400 tracking-wider uppercase">
                    {result.database !== "uniprot" &&
                    result.database !== "protein" ? (
                      <span>
                        GC Content:{" "}
                        <span className="text-emerald-500 font-bold font-mono">
                          {getGCContent()}%
                        </span>
                      </span>
                    ) : (
                      <span>
                        Estimated Molecular Weight:{" "}
                        <span className="text-purple-500 font-bold font-mono">
                          {getEstimatedMolWeight()} kDa
                        </span>
                      </span>
                    )}
                    <span>
                      Full length:{" "}
                      <span className="text-indigo-500 font-mono font-bold">
                        {sequence.length.toLocaleString()} bases
                      </span>
                    </span>
                  </div>
                </div>
              )}

              {sequenceError && (
                <div className="text-[11px] text-rose-500 font-semibold flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{sequenceError}</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Accordion AI Summary Container */}
      {isSummaryOpen && (
        <div className="summary-container mt-4 p-4 rounded-xl bg-indigo-50/30 dark:bg-indigo-950/10 border border-indigo-100/50 dark:border-indigo-900/20 shadow-2xs">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 font-medium text-xs text-indigo-700 dark:text-indigo-400">
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI biological annotation & significance summary:</span>
            </div>
          </div>

          {isLoadingSummary && (
            <div className="summary-loading flex items-center gap-2.5 py-2 text-xs text-neutral-500 dark:text-neutral-400">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-500" />
              <span>Querying Gemini for entry molecular role details...</span>
            </div>
          )}

          {summaryError &&
            (summaryError === "STATIC_HOST_NO_KEY" ? (
              <div className="text-xs text-indigo-200 py-3 font-medium flex flex-col gap-3 bg-indigo-950/20 border border-indigo-900/35 p-4 rounded-xl mt-1">
                <div className="flex gap-2.5 items-start">
                  <div className="p-1.5 bg-indigo-500/15 rounded-lg border border-indigo-500/25 text-indigo-450 shrink-0">
                    <Key className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <h5 className="font-bold text-indigo-300 text-xs tracking-tight">
                      AI Key Required on Static Hosting
                    </h5>
                    <p className="text-[11px] text-zinc-400 font-semibold leading-relaxed">
                      To access real-time AI Biological Annotations, please
                      follow these simple steps to provide your own free Gemini
                      API Key:
                    </p>
                    <div className="mt-2.5 space-y-2.5 border-t border-indigo-900/35 pt-2.5 text-[11px] text-zinc-300 font-medium leading-relaxed">
                      <div className="flex gap-2">
                        <span className="flex items-center justify-center w-4 h-4 rounded-full bg-indigo-500/15 text-indigo-300 font-bold text-[9px] shrink-0 mt-0.5">
                          1
                        </span>
                        <span>
                          Go to{" "}
                          <a
                            href="https://aistudio.google.com/app/apikey"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-450 hover:text-indigo-300 underline font-bold inline-flex items-center gap-0.5"
                          >
                            Google AI Studio{" "}
                            <ExternalLink className="w-3 h-3 inline" />
                          </a>{" "}
                          to generate a free Gemini key.
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <span className="flex items-center justify-center w-4 h-4 rounded-full bg-indigo-500/15 text-indigo-300 font-bold text-[9px] shrink-0 mt-0.5">
                          2
                        </span>
                        <span>
                          Click{" "}
                          <strong className="text-white font-semibold">
                            "Create API Key"
                          </strong>{" "}
                          and copy it.
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <span className="flex items-center justify-center w-4 h-4 rounded-full bg-indigo-500/15 text-indigo-300 font-bold text-[9px] shrink-0 mt-0.5">
                          3
                        </span>
                        <span>
                          <strong className="text-white font-semibold">
                            Paste and save
                          </strong>{" "}
                          the key below.
                        </span>
                      </div>
                    </div>

                    {/* Paste Input Field */}
                    <div className="mt-3.5 border-t border-indigo-900/35 pt-3.5">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                        Paste Gemini API Key
                      </label>
                      <div className="flex flex-col sm:flex-row gap-2.5">
                        <div className="relative min-w-0 flex-1 flex items-center">
                          <input
                            type={showInlineKey ? "text" : "password"}
                            value={inlineKey}
                            onChange={(e) => setInlineKey(e.target.value)}
                            placeholder="Paste your key (e.g., AIzaSy...)"
                            className="w-full pl-3 pr-8 py-2 bg-neutral-950 text-neutral-200 border border-zinc-800 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 font-mono text-[11px] transition-all placeholder:text-zinc-700 font-medium"
                          />
                          <button
                            type="button"
                            onClick={() => setShowInlineKey(!showInlineKey)}
                            className="absolute right-2 p-1 text-zinc-500 hover:text-zinc-300 rounded-md cursor-pointer"
                            title={showInlineKey ? "Hide key" : "Show key"}
                          >
                            {showInlineKey ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={handleSaveInlineKey}
                          disabled={!inlineKey.trim()}
                          className="px-4 py-2 sm:px-3 sm:py-1.5 justify-center bg-indigo-600 hover:bg-indigo-500 disabled:opacity-45 disabled:hover:bg-indigo-600 text-white text-[11px] font-bold rounded-lg cursor-pointer transition-colors shrink-0 flex items-center gap-1.5"
                        >
                          <Check className="w-3 h-3 shrink-0" />
                          <span>Save Key</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-rose-600 dark:text-rose-400 py-2.5 font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{summaryError}</span>
              </div>
            ))}

          {summary && !isLoadingSummary && (
            <div className="space-y-3">
              <p className="summary-content text-xs sm:text-sm text-brand-text dark:text-neutral-200 font-sans leading-relaxed font-semibold text-left">
                {summary}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Card Action footer / accordion toggles */}
      <div className="mt-4 flex items-center justify-between gap-2.5 border-t border-brand-border/30 pt-3.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* Card Expansion toggles */}
          <button
            onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-900 border border-brand-border dark:border-neutral-800 rounded-lg text-xs font-bold text-neutral-600 dark:text-neutral-400 cursor-pointer transition-colors"
          >
            <span>{isDetailsExpanded ? "Hide Details" : "Expand Details"}</span>
            {isDetailsExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {result.database === 'uniprot' && result.isCanonical && (
            <button
              onClick={() => alert("Alternative isoforms data would fetch here from UniProt REST API.")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs font-bold text-indigo-700 dark:text-indigo-400 cursor-pointer transition-colors"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>View Alternative Isoforms</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          )}

          {!isSummaryOpen ? (
            <button
              onClick={fetchSummary}
              className="summarize-button inline-flex items-center gap-1.5 px-3.5 py-1.5 cursor-pointer bg-indigo-50/60 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/30 rounded-lg text-xs font-semibold hover:shadow-2xs transition-all"
              title="Generate AI annotation"
            >
              <Sparkles className="w-3.5 h-3.5 animate-pulse" />
              <span>AI Summarize</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsSummaryOpen(false)}
                className="hide-summary-button inline-flex items-center gap-1.5 px-3 py-1.5 cursor-pointer bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-lg text-xs font-semibold border border-neutral-200 dark:border-neutral-800 transition-colors"
              >
                <span>Hide Annotation</span>
              </button>
              {summary && (
                <button
                  onClick={fetchSummary}
                  className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-900 cursor-pointer"
                  title="Regenerate Summary"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {userGeminiApiKey && (
          <div className="flex items-center gap-2 text-[10.5px] text-zinc-500 dark:text-neutral-500 font-medium font-sans">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-450 shrink-0" />
            <span>Using custom API key</span>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9, x: 50 }}
            animate={{ opacity: 1, y: 0, scale: 1, x: 0 }}
            exit={{ opacity: 0, y: 20, scale: 0.95, x: 20 }}
            transition={{ type: "spring", stiffness: 180, damping: 15 }}
            className="fixed bottom-6 right-6 z-[600] flex items-center gap-3.5 p-4 bg-zinc-950/95 border border-indigo-900/30 text-neutral-100 rounded-xl shadow-2xl backdrop-blur-md max-w-sm"
          >
            <div className="flex items-center justify-center w-7 h-7 rounded-full bg-emerald-500/10 text-emerald-450 shrink-0">
              <Check className="w-4 h-4" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-[11px] font-bold tracking-wider text-white uppercase font-sans">
                Copied Accession
              </p>
              <p className="text-[10.5px] text-zinc-400 font-medium leading-normal mt-0.5">
                Successfully copied identifier{" "}
                <span className="font-mono text-indigo-400 font-bold">
                  {result.id}
                </span>{" "}
                to clipboard.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
