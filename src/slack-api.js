const fetch = require('node-fetch');
const crypto = require('crypto'); // For varifying request signatures
const qs = require('qs'); // For varifying request signatures

// Check the request is from Slack, and has a matching secret signature to our app.
function VerifyRequestSignature(req, res, next) {
  // Check for correct headers
  if(!req.headers['x-slack-signature'] ||!req.headers['x-slack-request-timestamp']) {
    res.status(400).send('Request Verification Failed; Missing headers.');
    return;
  }

  // If req timestamp is 5+ min old, could be a replay attack- ignore it.
  const requestTimestamp = req.headers['x-slack-request-timestamp'];
  if (Math.abs(Math.floor(Date.now() / 1000) - requestTimestamp) > 60 * 5) {
    console.log('Request too old! Ignoreing request.\n');
    res.status(400).send('Request Verification Failed; Request is too old.');
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

// Respond imediately to the POST request, then continue
function RespondProcessing(req, res, next) {
  res.status(200).type('json').json({ response_type: 'in_channel', text: 'processing..' });
  console.log(`POST request to '${req.body.command}', with data: '${req.body.text}'`);
  next('route');
}

// Send a message to the slack channel, query had no results.
function RespondInChannel(responseUrl, text) {
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
function RespondShowimag(responseUrl, imgTitle, imgUrl) {
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

module.exports = {
  VerifyRequestSignature,
  RespondProcessing,
  RespondInChannel,
  RespondShowimag,
};
