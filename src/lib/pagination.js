const { z } = require('zod');

// Cursor pagination for lists ordered newest-first by id: "the next page is every row with id < cursor".
// Unlike OFFSET it costs the same on page 1 and page 10,000, and it does not skip or repeat rows
// when new ones are created between requests. The cursor is opaque to clients (base64url of the last id).
const encodeCursor = (id) => Buffer.from(String(id)).toString('base64url');

function decodeCursor(cursor) {
  const text = Buffer.from(cursor, 'base64url').toString();
  const id = Number(text);
  return /^\d+$/.test(text) && Number.isSafeInteger(id) && id > 0 ? id : null;
}

// zod field: validates and turns the opaque string into the numeric id.
const cursorField = z.string().transform((value, ctx) => {
  const id = decodeCursor(value);
  if (id === null) {
    ctx.issues.push({ code: 'custom', message: 'Invalid cursor', input: value });
    return z.NEVER;
  }
  return id;
});

// Query fields shared by every paged list. `page` (offset) stays for compatibility; `cursor` is preferred.
const pagingFields = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  cursor: cursorField.optional(),
};

// Runs a newest-first list in either mode. `fetch({ where, skip, take })` returns rows; `count(where)` the total.
//   cursor mode: no COUNT, no OFFSET; response is { data, nextCursor, pageSize }
//   offset mode: { data, total, page, pageSize, nextCursor } (nextCursor lets a client switch to cursors)
async function paginate({ where, page, pageSize, cursor, fetch, count }) {
  if (cursor !== undefined) {
    const rows = await fetch({ where: { ...where, id: { lt: cursor } }, skip: 0, take: pageSize + 1 });
    const data = rows.slice(0, pageSize);
    return { data, nextCursor: rows.length > pageSize ? encodeCursor(data.at(-1).id) : null, pageSize };
  }
  const [data, total] = await Promise.all([fetch({ where, skip: (page - 1) * pageSize, take: pageSize }), count(where)]);
  const more = page * pageSize < total && data.length > 0;
  return { data, total, page, pageSize, nextCursor: more ? encodeCursor(data.at(-1).id) : null };
}

module.exports = { pagingFields, paginate, encodeCursor };
