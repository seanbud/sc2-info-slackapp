// For making requests
var rp = require('request-promise');

// For varifying request signatures
const crypto = require('crypto');
const qs = require('qs');

// For parsing, scraping data
var fuzzysearch = require('fuzzy-search');
var cheerio = require('cheerio');

// framework, app setup
var express = require('express');
var app = express();
app.use(express.urlencoded({extended: false}));
app.use(express.static(__dirname + '/public'));
require('dotenv').config(); // only used for testing on localhost


// Start Server
var PORT = process.env.PORT || 8000;
app.listen(PORT, function() {
	console.log('starting server -- listening on port ' + PORT + '.\n');
});

// Serve App Homepage
app.get('/', function(req,res){
	res.sendFile(__dirname + '/index.html');
});

// Authenticate Workspace
app.get('/oauth', (req, res) => {
    rp({
        method: 'GET',
        uri: 'https://slack.com/api/oauth.access?code='
            +req.query.code+
            '&client_id='+process.env.CLIENT_ID+
            '&client_secret='+process.env.CLIENT_SECRET,
	    transform: (body) => { return JSON.parse(body); }
    })
    .then( function (JSONresponse){
        if (!JSONresponse.ok) {
            var err_msg = "Error encountered while authenticating your workspace: " + JSON.stringify(JSONresponse);
            console.log(err_msg);
            res.send(err_msg).status(200).end();
        } else {
            console.log(JSONresponse)	
			res.sendFile(__dirname + '/oauth_success.html');
        }
    })
})

// Reply in channel with a map image
app.post('/map', VerifyRequestSignature,

	// Respond imediately to the POST request, then continue
	function (req, res, next) {
		// Handle help msg
		if(req.body.text === '' || req.body.text === 'help') {
			res.status(200).send(slack_helpmsg_map);
			return;
		}

		// Otherwise, respond 200 and continue.
		res.status(200).type('json').json({ response_type: "in_channel" });
		console.log('POST request to \'' + req.body.command + '\', with data: \'' + req.body.text + '\'');
		next();
	}, 
	
	// Query a list of pages from the Liquipedia API ("Category:Maps"). Return a list of map titles.
	function (req, res) {
		rp({
			method: 'GET',
			uri: 'https://liquipedia.net/starcraft2/api.php?action=query&format=json&list=categorymembers&cmtitle=Category%3AMaps&cmlimit=max',
			gzip: true,
			headers: {
				'User-Agent': 'Sc2 Info SlackBot/v1.0 (https://github.com/seanbud/sc2-info-slackapp/; sbudning@gmail.com)'
			},
			
			// parse, filter, map the data into a list of map titles.
			transform: function (body, response, resolveWithFullResponse) {
				return JSON.parse(body).query.categorymembers
							.filter(function(page) { return page.ns == '0'; })
							.map(page => page.title );
			}
		})

		// Fuzzy-search for the closest map title,
		//	Request its' liquipedia page, scrape the img.
		//	 Send POST to slack, show the map image and title.
		.then(function (map_list) {
			var searcher = new fuzzysearch(map_list, [], { sort: true });
			var search_results = searcher.search(req.body.text);

			// Check for 0 matching map results
			if(search_results.length < 1) {
				slack_response_noresults(req.body.response_url, req.body.text);
				return;
			}

			// Get a uri for the map's liquipedia page
			var map_title = search_results[0];
			var map_page_uri = 'https://liquipedia.net/starcraft2/' + map_title.replace(' ','_');

			// Request the html for the related map page
			rp({
				method: 'GET',
				uri: map_page_uri,
				gzip: true,
				headers: {
					'User-Agent': 'Sc2 Info SlackBot/v1.0 (https://github.com/seanbud/sc2-info-slackapp/; sbudning@gmail.com)'
				}
			})
			
			.then(function (response_html) {
				// Use cheerio to scrape the img url of the first image contained in a link.
				const $ = cheerio.load(response_html);
				const img_url = 'https://liquipedia.net' + $('a > img')[0].attribs['src'];

				// Report the file we are serving
				console.log('Serving :  ' + img_url);

				// Send a second and final response to slack. Display the map image and title.
				slack_response_showimage(req.body.response_url, map_title, img_url);
			})
		})
		
		// Log errors to server
		.catch(function (err) {
			console.error(err);
		});
});


// Slack Responses -----------------
function slack_response_noresults(response_url, search_term) {
	rp({
		method: 'POST',
		uri: response_url,
		body: {
			'response_type': "in_channel",
			'text': 'The search term \"' + search_term + '\" yielded no results.'
		},
		json: true
	});
};

function slack_response_showimage(response_url, img_title, img_url) {
	rp({
		method: 'POST',
		uri: response_url,
		json: true,
		body: {
			'response_type': 'in_channel',
			'attachments': [{
				'title': img_title,
				'fallback': 'image of ' + img_title,
				'image_url': img_url
			}]
		}
	});
};

const slack_helpmsg_map = 'Command */map* _<map name>_ , where _map name_ is the name of an sc2 map. '+
	'I will reply with the closest matching map title and image. \n\n'+
	'For example, ```/map habit station``` will pull up the map *Habitation Station*.\n';

// Slack Request Helpers -----------------
function VerifyRequestSignature(req,res,next) {
	/*
		pseudo-code,
		----------------
		1. Retrieve timestamp from header in req. check for replay attacks.
		2. Concatenate 'v0', the timestamp, and the body of the request to form a basestring. Use a colon as the delimiter between each. 
			For example, v0:123456789:command=/weather&text=94070.
		3. find library for HMAC SHA256, and use it to, hash the above basestring, using the Slack Signing Secret as the key.
		4. Retrieve ' X-Slack-Signature' from header in req.
		5. Compare this computed signature to the xslacksig we just retrieved.
	*/
	const timestamp = req.headers['x-slack-request-timestamp'];
	// If req timestamp is 5+ min old, could be a replay attack- ignore it.
	if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 60 * 5) { 
		console.log('Request too old! Ignoreing request.\n');
		return; 
	}
	const requestBody = qs.stringify(req.body,{ format:'RFC1738' });
	const basestring = 'v0:' + timestamp + ':' + requestBody;

	// Hash above basetring using env.signingsecret as the key.
	const computed_sig = 'v0=' + 
					crypto.createHmac('sha256', process.env.SIGNING_SECRET)
                        .update(basestring, 'utf8')
                        .digest('hex');

	const req_sig = req.headers['x-slack-signature'];

	// Compare, and continue if the signature matches.
	if (crypto.timingSafeEqual( 
		Buffer.from(computed_sig, 'utf8'), 
		Buffer.from(req_sig, 'utf8')))
	{
		next();
	} else {
		return res.status(400).send('Request Verification Failed');
	}
}