export const SYNONYMS: Record<string, string[]> = {
  // Disease -> gene/protein names
  "breast cancer": ["BRCA1", "BRCA2", "TP53", "HER2", "PALB2"],
  alzheimers: ["APP", "PSEN1", "PSEN2", "MAPT", "APOE"],
  "alzheimer's": ["APP", "PSEN1", "PSEN2", "MAPT", "APOE"],
  parkinson: ["SNCA", "LRRK2", "PINK1", "PARK2"],
  diabetes: ["INS", "INSR", "GCK", "HNF1A", "PDX1"],
  cancer: ["TP53", "KRAS", "MYC", "EGFR", "PTEN"],
  hiv: ["GAG", "ENV", "POL", "REV", "TAT"],
  covid: ["ORF1ab", "spike", "nucleocapsid", "ACE2"],
  coronavirus: ["spike protein", "ACE2", "TMPRSS2"],

  // Function -> protein names
  "tumor suppressor": ["TP53", "RB1", "PTEN", "APC", "BRCA1"],
  "blood clotting": ["F8", "F9", "VWF", "PROS1", "THBD"],
  "immune response": ["IL6", "TNF", "IFNG", "IL1B", "TLR4"],
  "dna repair": ["BRCA1", "BRCA2", "MLH1", "MSH2", "ATM"],
  photosynthesis: ["RbcL", "psbA", "atpB", "rbcS"],
  "muscle contraction": ["MYH7", "ACTA1", "TPM1", "TNNT2", "MYL2"],
  "oxygen transport": ["HBA1", "HBB", "HBG1", "HBFAS"],
  "cell division": ["CDK1", "CCNB1", "BUB1", "MAD2L1"],
  "protein folding": ["HSP90AA1", "HSPA1A", "CCT2", "DNAJB1"],

  // Lay terms -> scientific terms
  "brain protein": ["neuronal", "synaptic", "CNS"],
  "heart protein": ["cardiac", "myocardial", "cardiomyopathy"],
  "liver enzyme": ["hepatic", "CYP", "ALT", "AST"],
  "kidney protein": ["renal", "nephrin", "podocin"],
  hormone: ["insulin", "glucagon", "cortisol", "estrogen"],
  "antibiotic target": ["penicillin binding", "gyrase", "topoisomerase"],

  // Organism aliases
  human: ["Homo sapiens"],
  mouse: ["Mus musculus"],
  rat: ["Rattus norvegicus"],
  yeast: ["Saccharomyces cerevisiae"],
  fly: ["Drosophila melanogaster"],
  worm: ["Caenorhabditis elegans"],
  zebrafish: ["Danio rerio"],
  bacteria: ["Escherichia coli"],
  "e. coli": ["Escherichia coli"],
  arabidopsis: ["Arabidopsis thaliana"],
};

const FILLER_WORDS = new Set([
  "the",
  "a",
  "an",
  "that",
  "which",
  "some",
  "kind",
  "of",
  "for",
  "in",
  "but",
]);
const ORGANISM_HINTS = new Set([
  "human",
  "mouse",
  "rat",
  "yeast",
  "bacteria",
  "e. coli",
  "fly",
  "worm",
  "zebrafish",
  "arabidopsis",
]);

export interface ParsedQuery {
  originalQuery: string;
  cleanedTerms: string[];
  expandedTerms: string[];
  organism: string | null;
  dbHint: "pdb" | "genbank" | "uniprot" | "all";
  expandedFrom: string[]; // Keep track of what synonyms were triggered
}

export function parseNaturalLanguageQuery(query: string): ParsedQuery {
  const lowerQuery = query.toLowerCase().trim();

  // 1. Detect synonyms first (multi-word like "breast cancer" is easier to find in the full string)
  let expandedTerms: string[] = [];
  let expandedFrom: string[] = [];
  let organism: string | null = null;
  let remainingQuery = lowerQuery;

  // Extract organisms from the full string if present
  for (const [key, val] of Object.entries(SYNONYMS)) {
    if (ORGANISM_HINTS.has(key) && remainingQuery.includes(key)) {
      organism = val[0];
      remainingQuery = remainingQuery.replace(key, "");
    } else if (remainingQuery.includes(key)) {
      expandedTerms.push(...val);
      expandedFrom.push(key);
      remainingQuery = remainingQuery.replace(key, "");
    }
  }

  // Tokenize
  const tokens = remainingQuery
    .split(/\s+/)
    .filter((t) => t.length > 0 && !FILLER_WORDS.has(t));

  // Detect DB hints
  let dbHint: "pdb" | "genbank" | "uniprot" | "all" = "all";
  const finalTerms: string[] = [];

  for (const token of tokens) {
    if (["structure", "crystal", "3d"].includes(token)) {
      dbHint = "pdb";
    } else if (["sequence", "gene", "mrna", "dna"].includes(token)) {
      dbHint = "genbank";
    } else if (["protein", "enzyme", "receptor", "kinase"].includes(token)) {
      dbHint = "uniprot";
    } else {
      finalTerms.push(token);
    }
  }

  return {
    originalQuery: query,
    cleanedTerms: finalTerms,
    expandedTerms: Array.from(new Set(expandedTerms)),
    organism,
    dbHint,
    expandedFrom: Array.from(new Set(expandedFrom)),
  };
}

export function buildNCBIQuery(parsed: ParsedQuery): string {
  if (parsed.cleanedTerms.length === 0 && parsed.expandedTerms.length === 0) return "";

  const cleanedPhrase = parsed.cleanedTerms.join(" ");
  const cleanedNoSpace = parsed.cleanedTerms.join("");
  
  const searchItems = [];
  if (cleanedPhrase) {
     searchItems.push(`"${cleanedPhrase}"`);
     if (cleanedPhrase !== cleanedNoSpace) {
       searchItems.push(`"${cleanedNoSpace}"`);
     }
  }
  if (parsed.expandedTerms.length > 0) {
     searchItems.push(...parsed.expandedTerms.map(t => `"${t}"`));
  }

  const base = searchItems.join(" OR ");
  // Strategy 1: exact organism filter (default to Homo sapiens)
  const org = parsed.organism ? ` AND "${parsed.organism}"[Organism]` : ` AND "Homo sapiens"[Organism]`;
  
  // Strategy 2 & 3: exclude predicted/computational, prefer mRNA/cDNA
  const excludePredicted = ` NOT predicted[Title]`;
  const preferMrna = ` AND biomol_mrna[PROP]`;
  
  return `(${base})${org}${excludePredicted}${preferMrna}`;
}

export function buildUniProtQuery(parsed: ParsedQuery): string {
  if (parsed.cleanedTerms.length === 0 && parsed.expandedTerms.length === 0) return "";

  const cleanedPhrase = parsed.cleanedTerms.join(" ");
  const cleanedNoSpace = parsed.cleanedTerms.join("");
  
  const searchItems = [];
  if (cleanedPhrase) {
     searchItems.push(cleanedPhrase);
     if (cleanedPhrase !== cleanedNoSpace) {
       searchItems.push(cleanedNoSpace);
     }
  }
  if (parsed.expandedTerms.length > 0) {
     searchItems.push(...parsed.expandedTerms);
  }

  // Create a combined query for each term
  // ?query=(gene:{term} OR protein_name:{term} OR ft_function:{term}) AND (organism_name:"{organism}") AND (reviewed:true)
  const termQueries = searchItems.map(
    (t) => `(gene_exact:"${t}" OR protein_name:"${t}" OR keyword:"${t}")`,
  );
  const base = termQueries.join(" OR ");
  
  // Strategy 1: Swiss-Reviewed status = True
  const reviewed = `(reviewed:true)`;
  
  // Strategy 3: Species tax_id filter (9606 for human unless specified)
  const org = parsed.organism
    ? `(organism_name:"${parsed.organism}")`
    : `(organism_id:9606)`;
    
  return `(${base}) AND ${org} AND ${reviewed}`;
}

export function buildPDBQuery(parsed: ParsedQuery): any {
  if (parsed.cleanedTerms.length === 0 && parsed.expandedTerms.length === 0) return null;

  const cleanedPhrase = parsed.cleanedTerms.join(" ");
  const cleanedNoSpace = parsed.cleanedTerms.join("");
  
  const searchItems = [];
  if (cleanedPhrase) {
     searchItems.push(cleanedPhrase);
     if (cleanedPhrase !== cleanedNoSpace) {
       searchItems.push(cleanedNoSpace);
     }
  }
  if (parsed.expandedTerms.length > 0) {
     searchItems.push(...parsed.expandedTerms);
  }

  const nodes = searchItems.map((t) => ({
    type: "terminal",
    service: "full_text",
    parameters: { value: t },
  }));

  if (parsed.organism) {
    nodes.push({
      type: "terminal",
      service: "text",
      parameters: {
        attribute: "rcsb_entity_source_organism.taxonomy_lineage.name",
        operator: "contains_words",
        value: parsed.organism,
      },
    } as any);
  }

  return {
    query: {
      type: "group",
      logical_operator: "and",
      nodes: [
        {
          type: "group",
          logical_operator: "or",
          nodes: searchItems.map((t) => ({
            type: "terminal",
            service: "full_text",
            parameters: { value: t },
          })),
        },
        ...(parsed.organism
          ? [
              {
                type: "terminal",
                service: "text",
                parameters: {
                  attribute:
                    "rcsb_entity_source_organism.taxonomy_lineage.name",
                  operator: "contains_words",
                  value: parsed.organism,
                },
              },
            ]
          : []),
      ],
    },
    return_type: "entry",
    request_options: {
      paginate: { start: 0, rows: 20 },
      sort: [{ sort_by: "score", direction: "desc" }],
    },
  };
}
