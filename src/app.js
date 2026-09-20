const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const requestId = require('./middleware/requestId');
const { notFound, errorHandler } = require('./middleware/error');
const { buildSpec } = require('./docs/openapi');
const { status: redisStatus } = require('./infra/redis');
const { status: mongoStatus } = require('./infra/mongo');

const app = express();

app.use(requestId);
app.use(helmet());
app.use(cors());
app.use(express.json());
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// Redis and MongoDB are not needed to serve requests, so their state is reported but never fails health.
app.get('/health', (req, res) => res.json({ status: 'ok', redis: redisStatus(), mongo: mongoStatus() }));

const spec = buildSpec();
app.get('/docs/openapi.json', (req, res) => res.json(spec));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'Procurement Portal API' }));

app.use('/api/v1', require('./routes/v1'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
