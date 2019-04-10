var express = require('express');
var app = express();

app.use(express.static(__dirname));
app.use(express.json());       // to support JSON-encoded bodies
app.use(express.urlencoded()); // to support URL-encoded bodies


app.post('/map', function (req, res) {
  // res.send(arg);
  var arg = req.body.text;
  res.send('POST request to map, with data: ' + arg);
  
})

app.listen(8000, function(){
 	console.log("restarting server -- listening on port 8000.");
})

