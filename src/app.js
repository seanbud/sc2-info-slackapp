const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
const slack = require('./slack-api');
const usage = require('./usage-strings');
const liquipedia = require('./liquipedia-api');
// require('dotenv').config(); // for local testing

const router = express.Router();
router.use(express.urlencoded({ extended: false }));

// Authenticate workspace
router.get('/oauth', (req, res) => {
  // build authentication uri
  const authURI = `https://slack.com/api/oauth.access?code=${req.query.code}
    &client_id=${process.env.CLIENT_ID}
    &client_secret=${process.env.CLIENT_SECRET}`;

  // fetch uri, then handle the response.
  fetch(authURI)
    .then(authResponse => JSON.parse(authResponse.body))
    .then((JSONresponse) => {
      if (JSONresponse.ok) {
        console.log(JSONresponse);
        res.sendFile(path.join(__dirname, '/public/oauth_success.html'));
      } else {
        const errMsg = `Error encountered while authenticating your workspace: ${JSON.stringify(JSONresponse)}`;
        console.err(errMsg);
        res.send(errMsg).status(401).end();
      }
    });
});

// Verify the request is from slack. Reply with help, or respond 200 and continue to the next route.
router.post('/:cmd', slack.VerifyRequestSignature, usage.HandleHelpMsg, slack.RespondProcessing);

// Reply in channel with a map image
router.post('/map', (req) => {
  liquipedia.QueryMap(req.body.text)
    .then(map => slack.ResponseShowimage(req.body.response_url, map.title, map.img))
    .catch(err => slack.ResponseInChannel(req.body.response_url, err.message));
});

module.exports = router;
