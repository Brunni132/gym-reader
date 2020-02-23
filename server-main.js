const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');

// Necessary to simply get text as a response (?)
app.use(bodyParser.text({ type: 'text/plain' }));
// Catch all the rest as binary
app.use(bodyParser.raw({ verify: (req, res, buf, encoding) => {
    if (buf && buf.length) {
      if (!req.rawBody) req.rawBody = buf;
      else req.rawBody = Buffer.concat(req.rawBody, buf);
    }
  }, type: '*/*', limit: '16mb' }));
app.use(cors());

app.get('/file.gym', (req, res, next) => {
  const data = fs.readFileSync('file.gym');
  res.end(data, 'binary');
});

app.post('/sound.wav', (req, res, next) => {
  fs.writeFile('sound.wav', req.rawBody, (err, result) => {
    res.sendStatus(200);
    });
});

app.listen(3001, () => {
});
