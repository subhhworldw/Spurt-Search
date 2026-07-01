import { SearchResult } from '../types';

export function sortResultsByScore(
  results: SearchResult[], 
  query: string,
  expectedOrganism: string = 'Homo sapiens',
  expectedLength?: number
): SearchResult[] {
  return results.sort((a, b) => (b.score || 0) - (a.score || 0));
}

export function calculateScore(
  result: SearchResult,
  query: string,
  expectedOrganism: string = 'Homo sapiens',
  expectedLength?: number
): SearchResult {
  let score = 0;
  const ranking_factors: string[] = [];

  const normalizedQuery = query.toUpperCase();
  const title = (result.title || '').toUpperCase();
  const id = (result.id || '').toUpperCase();

  // Exact match bonus
  if (id === normalizedQuery || title.includes(normalizedQuery)) {
    score += 50;
    ranking_factors.push('+50 Exact ID/Symbol Match');
  }

  // Organism match penalty
  if (result.organism && !result.organism.toLowerCase().includes(expectedOrganism.toLowerCase())) {
    score -= 30;
    ranking_factors.push(`-30 Non-target Organism (${result.organism})`);
  } else if (result.organism && result.organism.toLowerCase().includes(expectedOrganism.toLowerCase())) {
    score += 10;
    ranking_factors.push('+10 Target Organism Match');
  }

  // Evidence level bonus
  if (result.reviewed) {
    score += 25;
    ranking_factors.push('+25 Swiss-Reviewed (Curated)');
  }
  if (result.experimentalMethod) {
    score += 25;
    ranking_factors.push('+25 Experimental Evidence');
  }
  
  if (result.isCanonical) {
    score += 20;
    ranking_factors.push('+20 Canonical Isoform');
  } else if (result.database === 'uniprot' && result.isCanonical === false) {
    score -= 10;
    ranking_factors.push('-10 Non-canonical Isoform');
  }

  // Length similarity score
  if (expectedLength && result.sequenceLength) {
    const diff = Math.abs(expectedLength - result.sequenceLength);
    const lengthScore = Math.max(-20, 20 - Math.floor(diff / 10)); // Arbitrary scaling
    score += lengthScore;
    if (lengthScore > 0) {
      ranking_factors.push(`+${lengthScore} Length Similarity`);
    } else if (lengthScore < 0) {
      ranking_factors.push(`${lengthScore} Length Discrepancy`);
    }
  }

  // Recency boost (e.g. releaseDate: "2023-01-01")
  if (result.releaseDate) {
    const year = new Date(result.releaseDate).getFullYear();
    if (year >= 2020) {
      const boost = Math.min(30, (year - 2020 + 1) * 10);
      score += boost;
      ranking_factors.push(`+${boost} Recency Boost (${year})`);
    }
  }

  return {
    ...result,
    score,
    ranking_factors
  };
}

export function consolidateDuplicates(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  const consolidated: SearchResult[] = [];
  
  for (const res of results) {
    const key = `${res.database}-${res.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      consolidated.push(res);
    }
  }
  
  return consolidated;
}
