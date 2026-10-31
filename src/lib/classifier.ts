import type { KeywordMatchType } from "@prisma/client";
import { compactTransferText, normalizeTransferText } from "@/lib/text";

export type KeywordRule = {
  campaignId: string;
  campaignCode: string;
  campaignName: string;
  keyword: string;
  normalizedKeyword: string;
  matchType: KeywordMatchType;
};

export type ClassificationResult = {
  campaignId: string | null;
  matchedKeyword: string | null;
  status: "MATCHED" | "UNMATCHED";
};

export function classifyDescription(
  description: string,
  rules: KeywordRule[],
): ClassificationResult {
  const normalizedDescription = normalizeTransferText(description);
  const compactDescription = compactTransferText(description);
  const sortedRules = [...rules].sort((a, b) => {
    return compactTransferText(b.normalizedKeyword).length - compactTransferText(a.normalizedKeyword).length;
  });

  for (const rule of sortedRules) {
    if (matchesRule(description, normalizedDescription, compactDescription, rule)) {
      return {
        campaignId: rule.campaignId,
        matchedKeyword: rule.keyword,
        status: "MATCHED",
      };
    }
  }

  return {
    campaignId: null,
    matchedKeyword: null,
    status: "UNMATCHED",
  };
}

function matchesRule(
  rawDescription: string,
  normalizedDescription: string,
  compactDescription: string,
  rule: KeywordRule,
) {
  const compactKeyword = compactTransferText(rule.normalizedKeyword);
  if (!compactKeyword) {
    return false;
  }

  if (rule.matchType === "EXACT") {
    return normalizedDescription === rule.normalizedKeyword || compactDescription === compactKeyword;
  }

  if (rule.matchType === "REGEX") {
    try {
      return (
        new RegExp(rule.keyword, "i").test(rawDescription) ||
        new RegExp(rule.normalizedKeyword, "i").test(normalizedDescription)
      );
    } catch {
      return false;
    }
  }

  return normalizedDescription.includes(rule.normalizedKeyword) || compactDescription.includes(compactKeyword);
}
