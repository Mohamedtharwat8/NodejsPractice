const defaultRegistry = require('../config/versions');

// Marks responses with the API version and, for deprecated versions, the standard headers:
// Deprecation (RFC 9745), Sunset (RFC 8594) and a Link to the successor version.
const apiVersion = (name, registry = defaultRegistry) => (req, res, next) => {
  const info = registry[name] || {};
  res.set('X-API-Version', name);
  if (info.status === 'deprecated') {
    res.set('Deprecation', `@${Math.floor(new Date(info.deprecatedOn).getTime() / 1000)}`);
    if (info.sunset) res.set('Sunset', new Date(info.sunset).toUTCString());
    if (info.successor) res.append('Link', `<${info.successor}>; rel="successor-version"`);
  }
  next();
};

module.exports = apiVersion;
