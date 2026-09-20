const cache = require('../../infra/cache');

// Cached request detail (items, approval, order). Only the read endpoint uses it; every code path that
// makes a decision from a request's state reads the database. Anything that changes a request, its
// approval or its purchase order must call invalidate().
const TTL_SECONDS = 60;
const detailKey = (id) => cache.tenantKey('pr', id);

const wrapDetail = (id, loader) => cache.wrap(detailKey(id), TTL_SECONDS, loader);
const invalidate = (id) => cache.del(detailKey(id));

module.exports = { wrapDetail, invalidate };
