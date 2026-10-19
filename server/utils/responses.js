// Consistent JSON response helpers (same convention as the old Flask API):
//   success -> { "data": ... }  (optionally plus "meta" for pagination)
//   error   -> { "error": "message" }

export function send(res, status, body) {
  res.status(status).json(body);
}

/** 200 (or `status`) with { data, meta? } */
export function success(res, data, status = 200, meta = null) {
  const body = { data };
  if (meta !== null) body.meta = meta;
  res.status(status).json(body);
}

/** Error with { error: "message" } */
export function fail(res, message, status = 400) {
  res.status(status).json({ error: message });
}

/** Standard pagination metadata. */
export function paginatedMeta(page, perPage, total) {
  const totalPages = perPage ? Math.max(1, Math.ceil(total / perPage)) : 1;
  return { page, per_page: perPage, total, total_pages: totalPages };
}
