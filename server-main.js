const express = require('express');
const app = express();
const fs = require('fs');

app.get('/file.gym', (req, res, next) => {
  const data = fs.readFileSync('file.gym');
  res.end(data, 'binary');
});

app.listen(3001, () => {
  console.log(`TEMP listening`);
});
