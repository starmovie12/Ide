/**
 * useDiff — convenience hook over diffStore + diff library
 */

import { useDiffStore } from '@/lib/store/diffStore';
import { useEditorStore } from '@/lib/store/editorStore';
import { parseDiffBlocks, hasDiffBlocks } from '@/lib/diff/parser';
import { useCallback } from 'react';

export function useDiff() {
  const {
    pendingDiffs,
    reviewIndex,
    addDiff,
    removeDiff,
    clearDiffs,
    acceptDiff,
    rejectDiff,
    acceptAllForFile,
    rejectAllForFile,
    acceptAll,
    rejectAll,
    setReviewIndex,
    stepReview,
  } = useDiffStore();

  const { files } = useEditorStore();

  /** Parse an agent response and stage any diff blocks */
  const parseAndStage = useCallback(
    (agentResponse: string, agentName: string) => {
      if (!hasDiffBlocks(agentResponse)) return 0;
      const blocks = parseDiffBlocks(agentResponse);
      blocks.forEach((block) =>
        addDiff({
          filePath: block.filePath,
          searchContent: block.searchContent,
          replaceContent: block.replaceContent,
          agentName,
          acceptedAt: null,
        })
      );
      return blocks.length;
    },
    [addDiff]
  );

  const diffsForFile = useCallback(
    (filePath: string) => pendingDiffs.filter((d) => d.filePath === filePath),
    [pendingDiffs]
  );

  const uniqueFiles = [...new Set(pendingDiffs.map((d) => d.filePath))];

  const fileNames = uniqueFiles.map((fp) => {
    const entry = files.find((f) => f.path === fp);
    return entry ? (fp.split('/').pop() ?? fp) : (fp.split('/').pop() ?? fp);
  });

  return {
    pendingDiffs,
    reviewIndex,
    hasPendingDiffs: pendingDiffs.length > 0,
    pendingCount: pendingDiffs.length,
    uniqueFiles,
    fileNames,
    parseAndStage,
    acceptDiff,
    rejectDiff,
    acceptAllForFile,
    rejectAllForFile,
    acceptAll,
    rejectAll,
    removeDiff,
    clearDiffs,
    setReviewIndex,
    stepReview,
    diffsForFile,
  };
}
