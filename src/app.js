
const crypto = require('crypto'); // For varifying request signatures
const qs = require('qs'); // For varifying request signatures
const FuzzySearch = require('fuzzy-search'); // For parsing data
const cheerio = require('cheerio'); // For scraping data
const express = require('express'); // Framework setup
const path = require('path'); // Framework setup
const fetch = require('node-fetch'); // request resources via http
// require('dotenv').config(); // only used for testing locally

const router = express.Router;
router.use(express.urlencoded({ extended: false }));

// Send a message to the slack channel, query had no results.
function slackResponseInChannel(responseUrl, text) {
  fetch(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      response_type: 'in_channel',
      text,
    },
  });
}

// Send an image to the slack channel
function slackResponseShowimage(responseUrl, imgTitle, imgUrl) {
  fetch(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

// Dictionary of each command, how to use it
const usageStrings = {
  map: `Command */map* _<map name>_ , where _map name_ is the name of an sc2 map. 
    I will reply with the closest matching map title and image. \n\n
    For example, \`\`\`/map habit station\`\`\` will pull up the map *Habitation Station*.\n`,
};

function HandleHelpMsg(req, res, next) {
  // Handle help msg
  if (req.body.text === '' || req.body.text === 'help') {
    res.status(200).send(usageStrings[req.params.cmd]);
    return;
  }
  next();
}

// Respond imediately to the POST request, then continue
function RespondProcessing(req, res, next) {
  res.status(200).type('json').json({ response_type: 'in_channel', text: 'processing..' });
  console.log(`POST request to '${req.body.command}', with data: '${req.body.text}'`);
  next('route');
}

async function GetMapListFromLiquipedia() {
  return fetch('https://liquipedia.net/starcraft2/api.php?action=query&format=json&list=categorymembers&cmtitle=Category%3AMaps&cmlimit=max', {
    method: 'POST',
    gzip: true,
    headers: {
      'User-Agent': 'Sc2 Info SlackBot/v1.0 (https://github.com/seanbud/sc2-info-slackapp/; sbudning@gmail.com)',
    },
  })
    .then(body => JSON.parse(body).query.categorymembers)
    .filter(page => (page.ns === '0'))
    .map(page => page.title);
}

async function ScrapeFirstImgFromLiquipedia(pageUri) {
  return fetch(pageUri, {
    gzip: true,
    headers: {
      'User-Agent': 'Sc2 Info SlackBot/v1.0 (https://github.com/seanbud/sc2-info-slackapp/; sbudning@gmail.com)',
    },
  })
    .then((responseHtml) => {
      // Use cheerio to scrape the img url of the first image contained in a link.
      const $ = cheerio.load(responseHtml);
      return `https://liquipedia.net${$('a > img')[0].attribs.src}`;
    });
}

async function GetMatchingMapObj(searchTerm) {
  return new Promise(async (resolve, reject) => {
    const mapList = await GetMapListFromLiquipedia();
    const searcher = new FuzzySearch(mapList, [], { sort: true });
    const searchResults = searcher.search(searchTerm);

    // Check for 0 matching map results
    if (searchResults.length < 1) {
      reject(new Error(`The search term "${searchTerm}" yielded no results.`));
    }

    const mapTitle = searchResults[0];

    resolve({
      title: mapTitle,
      pageUri: `https://liquipedia.net/starcraft2/${mapTitle.replace(' ', '_')}`,
    });
  });
}

// --------------------- api routes ------------------------
// Authenticate workspace
router.get('/oauth', (req, res) => {
  // 'GET' authentication
  const authURI = `https://slack.com/api/oauth.access?code=${req.query.code}`
    + `&client_id=${process.env.CLIENT_ID}`
    + `&client_secret=${process.env.CLIENT_SECRET}`;
  const JSONresponse = fetch(authURI)
    .then(authResponse => JSON.parse(authResponse.body));

  // Handle results
  if (JSONresponse.ok) {
    console.log(JSONresponse);
    res.sendFile(path.join(__dirname, '/public/oauth_success.html'));
  } else {
    const errMsg = `Error encountered while authenticating your workspace: ${JSON.stringify(JSONresponse)}`;
    console.err(errMsg);
    res.send(errMsg).status(401).end();
  }
});

// Verify the request is from slack, respond 200 imediately, and process the command.
router.post('/:cmd', VerifyRequestSignature, HandleHelpMsg, RespondProcessing);

// Reply in channel with a map image
router.post('/map', async (req) => {
  // Get the map title, and article url
  const mapObj = await GetMatchingMapObj(req.body.text)
    .catch((err) => {
      slackResponseInChannel(req.body.response_url, err.message);
    });

  // Scrape the map image from the liquipedia article
  const imgUrl = await ScrapeFirstImgFromLiquipedia(mapObj.pageUri);
  slackResponseShowimage(req.body.response_url, mapObj.mapTitle, imgUrl);
});

module.exports = router;
