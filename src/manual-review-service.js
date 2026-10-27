import { upgradeSnapshot } from './comparison.js';
import { manualTemplate, validateManualReviews } from './manual-review.js';

export function createReviewTemplate(input) {return manualTemplate(upgradeSnapshot(input));}
export function attachManualReview(input,batch) {
  const snapshot=upgradeSnapshot(input);
  const manualReviews=validateManualReviews([...(snapshot.manualReviews??[]),batch],snapshot);
  return upgradeSnapshot({...snapshot,historyVersion:3,manualReviews});
}
