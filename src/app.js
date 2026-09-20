const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const { notFound, errorHandler } = require('./middleware/error');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/platform/tenants', require('./modules/tenants/tenants.routes'));
app.use('/auth', require('./modules/auth/auth.routes'));
app.use('/vendors', require('./modules/vendors/vendors.routes'));
app.use('/purchase-requests', require('./modules/purchase-requests/pr.routes'));
app.use('/purchase-orders', require('./modules/purchase-orders/po.routes'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
