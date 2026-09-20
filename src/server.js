const { port } = require('./config/env');
const app = require('./app');

app.listen(port, () => console.log(`procurement-portal listening on :${port}`));
