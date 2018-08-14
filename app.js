const express = require('express');
const app = express();

app.use(express.static('./'));
app.listen(1234, () => console.log('http://localhost:1234'));

process.on('SIGINT', function() {
  mongoHelper.close();
  process.exit(0);
});
