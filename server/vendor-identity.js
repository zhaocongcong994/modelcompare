export function canonicalVendorId(id) {
  return ['bytedance-seed', 'volcengine'].includes(id) ? 'bytedance' : id;
}

export function canonicalVendors(rows) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const grouped = new Map();
  for (const row of rows) {
    const id = canonicalVendorId(row.id);
    grouped.set(id, { ...(byId.get(id) || row), id });
  }
  return [...grouped.values()].sort((a, b) => Number(b.visible) - Number(a.visible) || a.displayOrder - b.displayOrder);
}
