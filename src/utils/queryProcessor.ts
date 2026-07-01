import { levenshteinEditDistance } from 'levenshtein-edit-distance';

export type InputType = 'gene_symbol' | 'accession_number' | 'uniprot_id' | 'pdb_id' | 'unknown';

export function normalizeGeneSymbol(input: string): string {
  const original = input;
  const transformed = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  console.log(`[QueryProcessor] Normalized: "${original}" -> "${transformed}"`);
  return transformed;
}

export async function expandQuerySynonyms(geneId: string): Promise<string[]> {
  // Mock external ID mapping service for demonstration
  // In production, this would call mygenes.info or NCBI Gene LinkOut
  const mockSynonyms: Record<string, string[]> = {
    'TP53': ['p53', 'tumor protein p53', 'BCC7', 'LFS1'],
    'BRCA1': ['RNF53', 'BRCAI', 'BRCC1', 'PPP1R53'],
    'BRCA2': ['BRCC2', 'FACD', 'FAD', 'FAD1', 'FANCD1'],
  };
  
  const normalized = normalizeGeneSymbol(geneId);
  const synonyms = mockSynonyms[normalized] || [];
  console.log(`[QueryProcessor] Expanded "${geneId}" to synonyms:`, synonyms);
  return synonyms;
}

export function classifyInputType(query: string): InputType {
  const original = query;
  let type: InputType = 'unknown';

  if (/^[NX][PM]_\d+(\.\d+)?$/i.test(query)) {
    type = 'accession_number'; // e.g. NP_000537
  } else if (/^[O,P,Q][0-9][A-Z0-9]{3}[0-9]|[A-N,R-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2}$/i.test(query)) {
    type = 'uniprot_id'; // e.g. P04637
  } else if (/^[1-9][A-Z0-9]{3}$/i.test(query)) {
    type = 'pdb_id'; // e.g. 1HHO
  } else if (/^[a-zA-Z0-9]+$/.test(query)) {
    type = 'gene_symbol';
  }

  console.log(`[QueryProcessor] Classified "${original}" as ${type}`);
  return type;
}

export function handleTypoCorrection(query: string): string | null {
  const knownGenes = ['TP53', 'BRCA1', 'BRCA2', 'EGFR', 'PTEN', 'MYC', 'VEGFA', 'ESR1', 'AKT1', 'PIK3CA'];
  const normalized = query.toUpperCase();
  
  let bestMatch: string | null = null;
  let minDistance = Infinity;

  for (const gene of knownGenes) {
    const distance = levenshteinEditDistance(normalized, gene);
    if (distance < minDistance) {
      minDistance = distance;
      bestMatch = gene;
    }
  }

  // Assuming >85% similarity (approx 1 or 2 edits for a 5+ letter word)
  // We'll use a simple threshold of 1 or 2 edits max depending on length
  const maxEdits = Math.max(1, Math.floor(normalized.length * 0.15));
  
  if (minDistance > 0 && minDistance <= maxEdits && bestMatch) {
    console.log(`[QueryProcessor] Typo correction suggested: "${query}" -> "${bestMatch}" (dist: ${minDistance})`);
    return bestMatch;
  }
  
  return null;
}
