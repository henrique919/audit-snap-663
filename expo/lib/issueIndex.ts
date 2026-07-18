import type { AnnotationRecord, PhotoAsset } from "@/types/models";

export interface IssueMediaIndex {
  assetsByIssue: Map<string, PhotoAsset[]>;
  hasMarkupByIssue: Set<string>;
}

/** Build reusable issue-media lookups in a single pass over each source table. */
export function buildIssueMediaIndex(
  assets: PhotoAsset[],
  annotations: AnnotationRecord[],
): IssueMediaIndex {
  const assetsByIssue = new Map<string, PhotoAsset[]>();
  for (const asset of assets) {
    let issueAssets = assetsByIssue.get(asset.issueId);
    if (!issueAssets) {
      issueAssets = [];
      assetsByIssue.set(asset.issueId, issueAssets);
    }
    if (!asset.deletedAt) issueAssets.push(asset);
  }

  const hasMarkupByIssue = new Set<string>();
  for (const annotation of annotations) {
    if (annotation.elements.length > 0) hasMarkupByIssue.add(annotation.issueId);
  }

  return { assetsByIssue, hasMarkupByIssue };
}
