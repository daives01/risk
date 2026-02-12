export function territorySignature(territories: Record<string, { ownerId: string; armies: number }> | undefined) {
  if (!territories) return "none";
  let checksum = 0;
  let count = 0;
  for (const [territoryId, territory] of Object.entries(territories)) {
    count += 1;
    checksum = (checksum + territory.armies * 31) | 0;
    checksum = (checksum + (territory.ownerId.codePointAt(0) ?? 0)) | 0;
    checksum = (checksum + (territoryId.codePointAt(0) ?? 0)) | 0;
  }
  return `${count}:${checksum}`;
}
