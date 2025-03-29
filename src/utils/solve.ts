import { distance as levenshtein } from "fastest-levenshtein";

type SolveData = {
  criminal: string;
  victims: string;
  motive: string;
};

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .trim();
}

function jaccardSimilarity(a: string, b: string) {
  const setA = new Set(normalize(a).split(/\s+/));
  const setB = new Set(normalize(b).split(/\s+/));
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

export function compareAnswers(correct: SolveData, user: SolveData) {
  const weights = {
    criminal: 0.4,
    victims: 0.4,
    motive: 0.2,
  };

  // raw scores
  let criminalScore =
    1 -
    levenshtein(normalize(correct.criminal), normalize(user.criminal)) /
      Math.max(correct.criminal.length, 1);
  let victimScore =
    1 -
    levenshtein(normalize(correct.victims), normalize(user.victims)) /
      Math.max(correct.victims.length, 1);
  let motiveScore = jaccardSimilarity(correct.motive, user.motive);

  // apply score floors
  criminalScore = Math.max(criminalScore, 0.6);
  victimScore = Math.max(victimScore, 0.6);
  motiveScore = Math.max(motiveScore, 0.4);

  const totalScore =
    criminalScore * weights.criminal +
    victimScore * weights.victims +
    motiveScore * weights.motive;

  return {
    criminal: criminalScore,
    victims: victimScore,
    motive: motiveScore,
    total: totalScore,
  };
}
