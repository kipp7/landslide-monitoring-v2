import type { EachBatchPayload } from "kafkajs";

type OffsetCommitContext = Pick<EachBatchPayload, "commitOffsetsIfNecessary" | "uncommittedOffsets">;

export async function commitResolvedOffsets(context: OffsetCommitContext): Promise<boolean> {
  const offsets = context.uncommittedOffsets();
  const hasOffsets = offsets.topics.some((topic) => topic.partitions.length > 0);
  if (!hasOffsets) return false;

  // autoCommit is disabled so a parameterless commitOffsetsIfNecessary() is a
  // no-op. Supplying the resolved offsets makes the post-ClickHouse commit
  // explicit and preserves at-least-once recovery after a writer restart.
  await context.commitOffsetsIfNecessary(offsets);
  return true;
}
