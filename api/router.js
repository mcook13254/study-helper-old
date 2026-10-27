'use strict';

// Static imports bundle the existing handlers into one Vercel function.
const handlers = Object.freeze({
  'config': require('../server/handlers/config'),
  'setup-status': require('../server/handlers/setup-status'),
  'setup-first-admin': require('../server/handlers/setup-first-admin'),
  'admin-create-user': require('../server/handlers/admin-create-user'),
  'admin-dashboard': require('../server/handlers/admin-dashboard'),
  'admin-manage-user': require('../server/handlers/admin-manage-user'),
  'admin-requests': require('../server/handlers/admin-requests'),
  'data-sync': require('../server/handlers/data-sync'),
  'library': require('../server/handlers/library'),
  'set-sharing': require('../server/handlers/set-sharing')
});

module.exports = async function router(req, res) {
  const endpoint = req.query?.endpoint;
  if (typeof endpoint !== 'string' || !Object.hasOwn(handlers, endpoint)) {
    return res.status(404).json({error: 'API endpoint not found.'});
  }
  // Keep request bodies, headers, methods and query parameters unchanged.
  // Each existing handler retains its own authentication and authorization.
  return handlers[endpoint](req, res);
};
