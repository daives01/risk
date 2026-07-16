interface LuckLabelPosition {
  id: string;
  left: number;
}

export function assignLuckLabelRows(positions: LuckLabelPosition[], minimumSeparation = 18) {
  const rows = new Map<string, number>();
  const sorted = [...positions].sort((a, b) => a.left - b.left);

  sorted.forEach((position, index) => {
    const nearby = sorted.slice(0, index).filter((other) => position.left - other.left < minimumSeparation);
    const usedRows = new Set(nearby.map((other) => rows.get(other.id)).filter((row) => row !== undefined));
    let row = 0;
    while (usedRows.has(row)) row += 1;
    rows.set(position.id, row);
  });

  return rows;
}
