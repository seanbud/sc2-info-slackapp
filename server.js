
const express = require('express');

const app = express();

// Server front end.
app.use(express.static(`${__dirname}/public`));
app.get('/', (req, res) => res.sendFile(`${__dirname}/public/index.html`));

// Handle all routes and behaviour of the app.
app.use(require('./src/app.js'));

// Start Server
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`starting server -- listening on port ${PORT}.\n`));
