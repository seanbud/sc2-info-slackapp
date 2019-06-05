const express = require('express');
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
  const authURI = `https://slack.com/api/oauth.access?code=${req.query.code}`
    + `&client_id=${process.env.CLIENT_ID}`
    + `&client_secret=${process.env.CLIENT_SECRET}`;

  // fetch uri, then handle the response.
  fetch(authURI)
    .then(data => data.json())
    .then((authResponse) => {
      if (authResponse.ok) res.sendFile('oauth_success.html', { root: './public' });
      else throw new Error(JSON.stringify(authResponse));
    })
    .catch((err) => {
      const errMsg = `Error encountered while authenticating your workspace: ${err.message}`;
      console.log(errMsg);
      res.send(errMsg).status(401).end();
    });
});

// Verify the request is from slack. Reply with help, or respond 200 and continue to the next route.
router.post('/:cmd', slack.VerifyRequestSignature, usage.HandleHelpMsg, slack.RespondProcessing);

// Reply in channel with a map image
router.post('/map',
  (req) => {
    liquipedia.QueryMap(req.body.text)
      .then(map => slack.RespondShowimage(req.body.response_url, map.title, map.img))
      .catch(err => slack.RespondInChannel(req.body.response_url, err.message));
  });

module.exports = router;
