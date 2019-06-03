
const rp = require('request-promise'); // For making requests
const crypto = require('crypto'); // For varifying request signatures
const qs = require('qs'); // For varifying request signatures
const FuzzySearch = require('fuzzy-search'); // For parsing data
const cheerio = require('cheerio'); // For scraping data
const express = require('express'); // Framework setup
const path = require('path'); // Framework setup
// const fetch = require('node-fetch');
// require('dotenv').config(); // only used for testing locally

const app = express();
app.use(express.urlencoded({ extended: false }));

// Authenticate Workspace
app.get('/oauth', (req, res) => {
  rp({
    method: 'GET',
    uri: `https://slack.com/api/oauth.access?code=${req.query.code}`
        + `&client_id=${process.env.CLIENT_ID}`
        + `&client_secret=${process.env.CLIENT_SECRET}`,
    transform: body => JSON.parse(body),
  })
    .then((JSONresponse) => {
      if (!JSONresponse.ok) {
        const errMsg = `Error encountered while authenticating your workspace: ${JSON.stringify(JSONresponse)}`;
        console.err(errMsg);
        res.send(errMsg).status(200).end();
      } else {
        console.log(JSONresponse);
        res.sendFile(path.join(__dirname, '/public/oauth_success.html'));
      }
    });
});

// Check the request is from Slack, and has a matching secret signature to our app.
function VerifyRequestSignature(req, res, next) {
  const requestTimestamp = req.headers['x-slack-request-timestamp'];

  // If req timestamp is 5+ min old, could be a replay attack- ignore it.
  if (Math.abs(Math.floor(Date.now() / 1000) - requestTimestamp) > 60 * 5) {
    console.log('Request too old! Ignoreing request.\n');
    return;
  }

  // Create a basestring
  const requestBody = qs.stringify(req.body, { format: 'RFC1738' });
  const basestring = 'v0:' + requestTimestamp + ':' + requestBody; // eslint-disable-line

  // Hash above basetring using the local signing secret as the key.
  const hash = crypto.createHmac('sha256', process.env.SIGNING_SECRET)
    .update(basestring, 'utf8')
    .digest('hex');

  // Prefix 'v0' to get the computed signature.
  const computedSig = `v0=${hash}`;

  // Compare, and continue if the signatures matches.
  if (crypto.timingSafeEqual(
    Buffer.from(computedSig, 'utf8'),
    Buffer.from(req.headers['x-slack-signature'], 'utf8'),
  )) {
    next();
  } else {
    res.status(400).send('Request Verification Failed');
  }
}


// Send a message to the slack channel, query had no results.
function slackResponseNoresults(responseUrl, searchTerm) {
  rp({
    method: 'POST',
    uri: responseUrl,
    body: {
      response_type: 'in_channel',
      text: `The search term "${searchTerm}" yielded no results.`,
    },
    json: true,
  });
}

// Send an image to the slack channel
function slackResponseShowimage(responseUrl, imgTitle, imgUrl) {
  rp({
    method: 'POST',
    uri: responseUrl,
    json: true,
    body: {
      response_type: 'in_channel',
      attachments: [{
        title: imgTitle,
        fallback: `image of ${imgTitle}`,
        image_url: imgUrl,
      }],
    },
  });
}

// Text on how to use the map command
const helpMessageMapCommand = 'Command */map* _<map name>_ , where _map name_ is the name of an sc2 map. '
    + 'I will reply with the closest matching map title and image. \n\n'
    + 'For example, ```/map habit station``` will pull up the map *Habitation Station*.\n';
// Reply in channel with a map image
app.post('/map', VerifyRequestSignature,

  // Respond imediately to the POST request, then continue
  (req, res, next) => {
    // Handle help msg
    if (req.body.text === '' || req.body.text === 'help') {
      res.status(200).send(helpMessageMapCommand);
      return;
    }

    // Otherwise, respond 200 and continue.
    res.status(200).type('json').json({ response_type: 'in_channel' });
    console.log(`POST request to '${req.body.command}', with data: '${req.body.text}'`);
    next();
  },

  // Query a list of pages from the Liquipedia API ("Category:Maps"). Return a list of map titles.
  (req) => {
    rp({
      method: 'GET',
      uri: 'https://liquipedia.net/starcraft2/api.php?action=query&format=json&list=categorymembers&cmtitle=Category%3AMaps&cmlimit=max',
      gzip: true,
      headers: {
        'User-Agent': 'Sc2 Info SlackBot/v1.0 (https://github.com/seanbud/sc2-info-slackapp/; sbudning@gmail.com)',
      },

      // parse, filter, map the data into a list of map titles.
      transform: body => JSON
        .parse(body).query.categorymembers
        .filter(page => (page.ns === '0'))
        .map(page => page.title),
    })

      // Scrape the related map's url, POST to slack showing the map image and title.
      .then((mapList) => {
        const searcher = new FuzzySearch(mapList, [], { sort: true });
        const searchResults = searcher.search(req.body.text);

        // Check for 0 matching map results
        if (searchResults.length < 1) {
          slackResponseNoresults(req.body.response_url, req.body.text);
          return;
        }

        // Get a uri for the map's liquipedia page
        const mapTitle = searchResults[0];
        const mapPageUri = `https://liquipedia.net/starcraft2/${mapTitle.replace(' ', '_')}`;

        // Request the html for the related map page
        rp({
          method: 'GET',
          uri: mapPageUri,
          gzip: true,
          headers: {
            'User-Agent': 'Sc2 Info SlackBot/v1.0 (https://github.com/seanbud/sc2-info-slackapp/; sbudning@gmail.com)',
          },
        })

          .then((responseHtml) => {
            // Use cheerio to scrape the img url of the first image contained in a link.
            const $ = cheerio.load(responseHtml);
            const imgUrl = 'https://liquipedia.net' + $('a > img')[0].attribs.src;

            // Report the file we are serving
            console.log(`Serving :  ${imgUrl}`);

            // Send a second and final response to slack. Display the map image and title.
            slackResponseShowimage(req.body.response_url, mapTitle, imgUrl);
          });
      })

      // Log errors to server
      .catch(err => console.error(err));
  });
