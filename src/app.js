const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const { corsOrigins, trustProxy } = require('./config/env');
const requestId = require('./middleware/requestId');
const { notFound, errorHandler } = require('./middleware/error');
const { buildSpec } = require('./docs/openapi');
const { status: redisStatus } = require('./infra/redis');
const { status: mongoStatus } = require('./infra/mongo');
const { status: queueStatus } = require('./infra/queue');

const app = express();

if (trustProxy) app.set('trust proxy', trustProxy);
app.use(requestId);
app.use(helmet());
// Open in development and tests; in production only origins in CORS_ORIGINS are allowed.
app.use(cors(process.env.NODE_ENV === 'production' ? { origin: corsOrigins } : undefined));
app.use(express.json());
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// Redis, MongoDB and the queue are not needed to serve requests, so their state is reported but never fails health.
app.get('/health', (req, res) => res.json({ status: 'ok', redis: redisStatus(), mongo: mongoStatus(), queue: queueStatus() }));

const spec = buildSpec();
app.get('/docs/openapi.json', (req, res) => res.json(spec));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'Procurement Portal API' }));

app.use('/api/v1', require('./routes/v1'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
