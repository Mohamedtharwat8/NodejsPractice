// API version registry. To deprecate a version, set its status and dates; every response from
// that version then carries Deprecation/Sunset/Link headers (see middleware/apiVersion.js).
// Policy: a deprecated version keeps working for at least 6 months before its sunset date.
//
//   v1: { status: 'deprecated', deprecatedOn: '2027-01-01', sunset: '2027-07-01', successor: '/api/v2' }
module.exports = {
  v1: { status: 'current' },
};
