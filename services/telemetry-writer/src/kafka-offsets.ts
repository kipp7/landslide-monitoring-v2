import type { EachBatchPayload } from "kafkajs";

type OffsetCommitContext = Pick<EachBatchPayload, "commitOffsetsIfNecessary" | "uncommittedOffsets">;

export async function commitResolvedOffsets(context: OffsetCommitContext): Promise<boolean> {
  const offsets = context.uncommittedOffsets();
  const hasOffsets = offsets.topics.some((topic) => topic.partitions.length > 0);
  if (!hasOffsets) return false;

  // autoCommit is disabled, so pass the resolved offsets explicitly.
  await context.commitOffsetsIfNecessary(offsets);
  return true;
}
