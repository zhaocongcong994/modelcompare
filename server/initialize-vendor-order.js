import { getDb, disconnectDb } from './db.js';

try {
  const db = await getDb();
  if (!db) throw new Error('PostgreSQL 不可用');
  const result = await db.$transaction(async (tx) => {
    // Match GET /admin/vendors exactly; retain the order the user already sees.
    const vendors = await tx.vendor.findMany({ orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }] });
    if (!vendors.length || vendors.some((vendor) => vendor.displayOrder !== 0)) {
      return { changed: false, message: '已存在排序配置，不覆盖现有设置' };
    }
    for (const [index, vendor] of vendors.entries()) {
      await tx.vendor.update({ where: { id: vendor.id }, data: { displayOrder: index + 1 } });
    }
    return { changed: true, vendors: vendors.map((vendor, index) => ({ id: vendor.id, name: vendor.name, displayOrder: index + 1, visible: vendor.visible })) };
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await disconnectDb();
}
